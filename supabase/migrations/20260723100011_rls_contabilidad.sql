-- =============================================================================
-- Permisos y RLS de contabilidad.
--
-- Alcance por PERMISO, no por sucursal: filtrar líneas por sucursal mostraría
-- medio asiento, que por definición no cuadra.
--
-- Una política RLS no puede distinguir "confirmar" de "anular" porque ambas son
-- un UPDATE sobre la misma fila. Por eso la política de UPDATE exige tener
-- alguno de los permisos de escritura, y la distinción fina se hace en el
-- trigger de la máquina de estados, que sí ve la transición.
-- =============================================================================

-- === PERMISOS NUEVOS ========================================================
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('asientos',  'ver',      'asientos.ver',       'Ver asientos contables'),
  ('asientos',  'crear',    'asientos.crear',     'Crear y editar asientos en borrador'),
  ('asientos',  'confirmar','asientos.confirmar', 'Confirmar asientos (los vuelve inmutables)'),
  ('asientos',  'anular',   'asientos.anular',    'Anular asientos por reversión'),
  ('periodos',  'cerrar',   'periodos.cerrar',    'Cerrar periodos contables'),
  ('periodos',  'reabrir',  'periodos.reabrir',   'Reabrir un periodo cerrado'),
  ('prorrateo', 'gestionar','prorrateo.gestionar','Cargar bases y generar prorrateos'),
  ('centros',   'gestionar','centros.gestionar',  'Crear y editar centros de costo'),
  ('reportes',  'ver',      'reportes.financieros.ver', 'Ver estados financieros')
on conflict (codigo) do nothing;

-- Administrador: todos los permisos, incluidos los nuevos.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r cross join public.permisos p
 where r.codigo = 'administrador'
on conflict do nothing;

-- Contador: lleva la contabilidad. Cierra periodos, pero NO los reabre:
-- reabrir un periodo cerrado queda reservado al administrador.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r
  join public.permisos p on p.codigo in (
    'asientos.ver', 'asientos.crear', 'asientos.confirmar', 'asientos.anular',
    'periodos.cerrar', 'prorrateo.gestionar', 'centros.gestionar',
    'reportes.financieros.ver'
  )
 where r.codigo = 'contador'
on conflict do nothing;

-- Cajero: NINGÚN permiso contable. El POS postea por la vía automática
-- (servidor, con origen_tipo), nunca con asientos manuales.

-- === CONTROL FINO DE TRANSICIONES ===========================================
-- Se enchufa en la máquina de estados ya existente.
--
-- Si auth.uid() es NULL estamos en contexto de servidor (service_role): el
-- posteo automático ya validó permisos en la Server Action, igual que en Fase 1.
create or replace function public.fn_asiento_before_update()
returns trigger
language plpgsql
as $$
begin
  if old.estado <> new.estado then
    if not (
      (old.estado = 'borrador'   and new.estado in ('confirmado','descartado')) or
      (old.estado = 'confirmado' and new.estado = 'anulado')
    ) then
      raise exception 'Transición de estado no permitida: % -> %.', old.estado, new.estado;
    end if;

    if new.estado = 'confirmado' then
      if auth.uid() is not null and not public.tengo_permiso('asientos.confirmar') then
        raise exception 'No tenés permiso para confirmar asientos.';
      end if;
      perform public.fn_exigir_periodo_abierto(new.periodo_id);
      new.confirmado_en  := coalesce(new.confirmado_en, now());
      new.confirmado_por := coalesce(new.confirmado_por, auth.uid());

    elsif new.estado = 'anulado' then
      if auth.uid() is not null and not public.tengo_permiso('asientos.anular') then
        raise exception 'No tenés permiso para anular asientos.';
      end if;
      if old.tipo = 'reversion' then
        raise exception 'Un asiento de reversión no se puede anular.';
      end if;
      new.anulado_en  := coalesce(new.anulado_en, now());
      new.anulado_por := coalesce(new.anulado_por, auth.uid());
    end if;
  end if;

  if old.estado <> 'borrador' then
    if new.fecha       is distinct from old.fecha
    or new.tipo        is distinct from old.tipo
    or new.glosa       is distinct from old.glosa
    or new.periodo_id  is distinct from old.periodo_id
    or new.origen_tipo is distinct from old.origen_tipo
    or new.origen_id   is distinct from old.origen_id then
      raise exception
        'Asiento % está % y es inmutable. Para corregirlo, anulalo por reversión.',
        old.id, old.estado;
    end if;
  end if;

  return new;
end;
$$;

-- (fn_exigir_permiso se define en la migración de cierre de periodo.)

-- El contador de consecutivos no se expone: solo lo toca el trigger.
alter function public.fn_siguiente_numero_asiento(text, int) security definer;

-- === RLS ====================================================================
alter table public.centros_costo        enable row level security;
alter table public.cuentas_subtipos     enable row level security;
alter table public.asientos             enable row level security;
alter table public.asientos_lineas      enable row level security;
alter table public.asientos_anulaciones enable row level security;
alter table public.asientos_adjuntos    enable row level security;
alter table public.prorrateo_bases      enable row level security;
alter table public.asientos_consecutivos enable row level security;
-- asientos_consecutivos queda SIN políticas: nadie lo toca directo. El acceso
-- va por fn_siguiente_numero_asiento, que es SECURITY DEFINER.

-- --- Catálogos de apoyo: lectura abierta a usuarios autenticados ------------
create policy subtipos_select on public.cuentas_subtipos
  for select to authenticated using (true);

create policy centros_select on public.centros_costo
  for select to authenticated using (true);
create policy centros_insert on public.centros_costo
  for insert to authenticated with check (public.tengo_permiso('centros.gestionar'));
create policy centros_update on public.centros_costo
  for update to authenticated
  using (public.tengo_permiso('centros.gestionar'))
  with check (public.tengo_permiso('centros.gestionar'));

-- --- Asientos ---------------------------------------------------------------
create policy asientos_select on public.asientos
  for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('asientos.ver'));

create policy asientos_insert on public.asientos
  for insert to authenticated
  with check (public.tengo_permiso('asientos.crear'));

-- La distinción confirmar/anular la hace el trigger; acá basta con exigir
-- alguno de los permisos de escritura.
create policy asientos_update on public.asientos
  for update to authenticated
  using (
    public.tengo_permiso('asientos.crear')
    or public.tengo_permiso('asientos.confirmar')
    or public.tengo_permiso('asientos.anular')
  )
  with check (
    public.tengo_permiso('asientos.crear')
    or public.tengo_permiso('asientos.confirmar')
    or public.tengo_permiso('asientos.anular')
  );

-- --- Líneas -----------------------------------------------------------------
create policy lineas_select on public.asientos_lineas
  for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('asientos.ver'));

create policy lineas_insert on public.asientos_lineas
  for insert to authenticated with check (public.tengo_permiso('asientos.crear'));

create policy lineas_update on public.asientos_lineas
  for update to authenticated
  using (public.tengo_permiso('asientos.crear'))
  with check (public.tengo_permiso('asientos.crear'));

-- El DELETE de líneas solo aplica a borradores y lo controla el trigger
-- trg_lineas_solo_en_borrador.
create policy lineas_delete on public.asientos_lineas
  for delete to authenticated using (public.tengo_permiso('asientos.crear'));

-- --- Anulaciones y adjuntos -------------------------------------------------
create policy anulaciones_select on public.asientos_anulaciones
  for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('asientos.ver'));
create policy anulaciones_insert on public.asientos_anulaciones
  for insert to authenticated with check (public.tengo_permiso('asientos.anular'));

create policy adjuntos_select on public.asientos_adjuntos
  for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('asientos.ver'));
create policy adjuntos_insert on public.asientos_adjuntos
  for insert to authenticated with check (public.tengo_permiso('asientos.crear'));

-- --- Bases de prorrateo -----------------------------------------------------
create policy bases_select on public.prorrateo_bases
  for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('reportes.financieros.ver'));
create policy bases_insert on public.prorrateo_bases
  for insert to authenticated with check (public.tengo_permiso('prorrateo.gestionar'));
create policy bases_update on public.prorrateo_bases
  for update to authenticated
  using (public.tengo_permiso('prorrateo.gestionar'))
  with check (public.tengo_permiso('prorrateo.gestionar'));

do $$
declare v_p int;
begin
  select count(*) into v_p from public.permisos;
  raise notice 'RLS de contabilidad lista. Permisos totales: %.', v_p;
end $$;
