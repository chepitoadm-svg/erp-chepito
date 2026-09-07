-- =============================================================================
-- Módulo "Cierre mensual": checklist de lo que la conta de cada mes necesita.
-- Para cada mes se instancian requisitos (catálogo editable) por centro o por
-- cuenta de banco. Algunos se marcan solos mirando los datos ya cargados
-- (ventas, compras, planilla, conciliación); los demás se marcan a mano y
-- admiten archivos adjuntos (Supabase Storage, bucket privado 'cierre').
-- Anular nunca borrar: requisitos y archivos se desactivan/anulan.
-- =============================================================================

-- Permiso propio del módulo (admin lo tiene por soy_administrador).
insert into public.permisos (modulo, accion, codigo, descripcion)
  values ('cierre','gestionar','cierre.gestionar','Gestionar el cierre mensual y sus documentos')
on conflict (codigo) do nothing;
insert into public.roles_permisos (rol_id, permiso_id)
  select r.id, p.id from public.roles r, public.permisos p
  where r.codigo = 'contador' and p.codigo = 'cierre.gestionar'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Catálogo editable de requisitos.
--   alcance: 'global' (1 por mes), 'centro' (1 por centro de `centros`),
--            'cuenta_banco' (1 por cuenta de banco).
--   auto_fuente: si el sistema puede medir el avance solo.
-- ---------------------------------------------------------------------------
create table public.cierre_requisito (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  nombre       text not null,
  grupo        text not null,
  alcance      text not null check (alcance in ('global','centro','cuenta_banco')),
  auto_fuente  text check (auto_fuente in ('ventas','compras','planilla','conciliacion')),
  centros      text[],            -- códigos de centro; null = todos los finales
  requiere_archivo boolean not null default true,
  orden        int not null default 100,
  activo       boolean not null default true,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.cierre_requisito');

-- Un mes de cierre.
create table public.cierre_mes (
  id        uuid primary key default gen_random_uuid(),
  anio      int not null,
  mes       int not null check (mes between 1 and 12),
  estado    text not null default 'en_proceso' check (estado in ('en_proceso','cerrado')),
  notas     text,
  cerrado_en timestamptz, cerrado_por uuid,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid,
  unique (anio, mes)
);
select public.fn_adjuntar_auditoria('public.cierre_mes');

-- Un requisito instanciado para un mes (y centro / cuenta si aplica).
create table public.cierre_item (
  id           uuid primary key default gen_random_uuid(),
  cierre_id    uuid not null references public.cierre_mes(id) on delete cascade,
  requisito_id uuid not null references public.cierre_requisito(id),
  centro_id    uuid references public.centros_costo(id),
  cuenta_id    uuid references public.cuentas(id),
  estado       text not null default 'pendiente' check (estado in ('pendiente','listo','na')),
  nota         text,
  marcado_en timestamptz, marcado_por uuid,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
create unique index cierre_item_uq on public.cierre_item
  (cierre_id, requisito_id,
   coalesce(centro_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(cuenta_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index cierre_item_cierre on public.cierre_item (cierre_id);
select public.fn_adjuntar_auditoria('public.cierre_item');

-- Archivos adjuntos a un requisito (metadatos; el binario vive en Storage).
create table public.cierre_archivo (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid not null references public.cierre_item(id) on delete cascade,
  path      text not null,
  nombre    text not null,
  tamano    bigint,
  mime      text,
  estado    text not null default 'activo' check (estado in ('activo','anulado')),
  subido_en timestamptz not null default now(), subido_por uuid default auth.uid(),
  anulado_en timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create index cierre_archivo_item on public.cierre_archivo (item_id);
select public.fn_adjuntar_auditoria('public.cierre_archivo');

-- ---------------------------------------------------------------------------
-- RLS: leer/escribir requiere cierre.gestionar (o admin).
-- ---------------------------------------------------------------------------
alter table public.cierre_requisito enable row level security;
alter table public.cierre_mes       enable row level security;
alter table public.cierre_item      enable row level security;
alter table public.cierre_archivo   enable row level security;
do $$ declare t text;
begin
  foreach t in array array['cierre_requisito','cierre_mes','cierre_item','cierre_archivo'] loop
    execute format($f$create policy %I_sel on public.%I for select to authenticated
      using (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))$f$, t, t);
    execute format($f$create policy %I_wr on public.%I for all to authenticated
      using (public.tengo_permiso('cierre.gestionar')) with check (public.tengo_permiso('cierre.gestionar'))$f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Semilla de requisitos por defecto (editable después).
-- ---------------------------------------------------------------------------
insert into public.cierre_requisito (codigo, nombre, grupo, alcance, auto_fuente, centros, requiere_archivo, orden) values
  ('ventas_pos',   'Ventas del mes (Excel QuPOS)',        'Ventas',   'centro',       'ventas',       array['CH1','CH2'],               true,  10),
  ('ventas_ext',   'Ventas externas / mayoreo',           'Ventas',   'centro',       'ventas',       array['VEX'],                     true,  20),
  ('compras_mes',  'Compras del mes',                     'Compras',  'centro',       'compras',      array['CH1','CH2','VEX','CAS','TAL'], false, 30),
  ('banco_estado', 'Estado de cuenta del banco (Excel)',  'Bancos',   'cuenta_banco', null,           null,                             true,  40),
  ('banco_concil', 'Conciliación bancaria',               'Bancos',   'cuenta_banco', 'conciliacion', null,                             false, 50),
  ('depositos',    'Retiros / depósitos de caja al banco','Bancos',   'global',       null,           null,                             true,  60),
  ('caja_retiros', 'Retiros de las cajas',                'Caja',     'centro',       null,           array['CH1','CH2'],               true,  70),
  ('planilla_mes', 'Planillas del mes',                   'Planilla', 'global',       'planilla',     null,                             false, 80)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Cuentas que cuentan como "banco" para el cierre (solo 11-10-15-*).
-- ---------------------------------------------------------------------------
create or replace function public.fn_cierre_bancos()
returns table(id uuid) language sql stable set search_path = public as $$
  select id from public.cuentas
  where codigo like '11-10-15-%' and acepta_movimiento and estado='activo' and nombre !~* 'no utilizar';
$$;

-- ---------------------------------------------------------------------------
-- Genera (o completa) el checklist de un mes. Idempotente: no pisa lo ya hecho.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generar_cierre(p_anio int, p_mes int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cid uuid; r record;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_mes < 1 or p_mes > 12 then raise exception 'Mes inválido.'; end if;
  insert into public.cierre_mes (anio, mes) values (p_anio, p_mes)
    on conflict (anio, mes) do update set actualizado_en = now()
    returning id into v_cid;
  if v_cid is null then select id into v_cid from public.cierre_mes where anio=p_anio and mes=p_mes; end if;

  for r in select * from public.cierre_requisito where activo order by orden loop
    if r.alcance = 'global' then
      insert into public.cierre_item (cierre_id, requisito_id) values (v_cid, r.id)
      on conflict do nothing;
    elsif r.alcance = 'centro' then
      insert into public.cierre_item (cierre_id, requisito_id, centro_id)
        select v_cid, r.id, c.id from public.centros_costo c
        where c.activo and (
          (r.centros is null and c.tipo='final') or (r.centros is not null and c.codigo = any(r.centros)))
      on conflict do nothing;
    elsif r.alcance = 'cuenta_banco' then
      insert into public.cierre_item (cierre_id, requisito_id, cuenta_id)
        select v_cid, r.id, b.id from public.fn_cierre_bancos() b
      on conflict do nothing;
    end if;
  end loop;
  return v_cid;
end $$;
grant execute on function public.fn_generar_cierre(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Estado automático de un requisito, según su fuente y el rango del mes.
-- Devuelve: listo (bool/null), n (conteo), monto, detalle (marca especial).
-- ---------------------------------------------------------------------------
create or replace function public.fn_cierre_auto(
  p_auto text, p_ini date, p_fin date, p_centro uuid, p_cuenta uuid
) returns table(listo boolean, n int, monto numeric, detalle text)
language plpgsql stable set search_path = public as $$
declare v_n int; v_m numeric; v_pend int; v_hay boolean;
begin
  if p_auto = 'ventas' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.ventas_dia
      where estado='confirmado' and fecha between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'compras' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.facturas_compra
      where estado <> 'anulada' and fecha_emision between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'planilla' then
    select count(*) into v_n from public.planilla
      where fecha between p_ini and p_fin and asiento_id is not null and estado <> 'anulada';
    return query select v_n>0, v_n, null::numeric, null::text;
  elsif p_auto = 'conciliacion' then
    select exists (select 1 from public.conciliaciones_banco cb
      where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin)
      into v_hay;
    if not v_hay then
      return query select false, null::int, null::numeric, 'sin_estado'::text;
    else
      select count(*) filter (where l.estado='pendiente') into v_pend
        from public.conciliaciones_banco cb
        join public.estado_cuenta_lineas l on l.conciliacion_id = cb.id
        where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin;
      return query select (coalesce(v_pend,0)=0), v_pend, null::numeric, 'concil'::text;
    end if;
  else
    return query select null::boolean, null::int, null::numeric, null::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Detalle del checklist de un mes, con estado efectivo y conteo de archivos.
-- ---------------------------------------------------------------------------
create or replace function public.app_cierre_detalle(p_anio int, p_mes int)
returns table(
  item_id uuid, requisito_id uuid, codigo text, nombre text, grupo text, orden int,
  alcance text, auto_fuente text, requiere_archivo boolean,
  centro_codigo text, cuenta_codigo text, cuenta_nombre text,
  estado_manual text, nota text,
  auto_listo boolean, auto_n int, auto_monto numeric, auto_detalle text,
  estado_efectivo text, n_archivos int
)
language sql stable security definer set search_path = public as $$
  with m as (select id, make_date(p_anio,p_mes,1) ini, (make_date(p_anio,p_mes,1)+interval '1 month'-interval '1 day')::date fin
             from public.cierre_mes where anio=p_anio and mes=p_mes)
  select
    i.id, r.id, r.codigo, r.nombre, r.grupo, r.orden,
    r.alcance, r.auto_fuente, r.requiere_archivo,
    cc.codigo, cu.codigo, cu.nombre,
    i.estado, i.nota,
    a.listo, a.n, a.monto, a.detalle,
    case
      when i.estado = 'na' then 'na'
      when r.auto_fuente is not null then case when a.listo then 'listo' else 'pendiente' end
      else i.estado
    end as estado_efectivo,
    (select count(*)::int from public.cierre_archivo af where af.item_id = i.id and af.estado='activo')
  from m
  join public.cierre_item i on i.cierre_id = m.id
  join public.cierre_requisito r on r.id = i.requisito_id
  left join public.centros_costo cc on cc.id = i.centro_id
  left join public.cuentas cu on cu.id = i.cuenta_id
  left join lateral public.fn_cierre_auto(r.auto_fuente, m.ini, m.fin, i.centro_id, i.cuenta_id) a on true
  where public.soy_administrador() or public.tengo_permiso('cierre.gestionar')
  order by r.orden, cc.codigo nulls first, cu.codigo nulls first;
$$;
grant execute on function public.app_cierre_detalle(int, int) to authenticated;

-- Lista de meses con avance (listos / total, sin contar los 'na').
create or replace function public.app_listar_cierres()
returns table(id uuid, anio int, mes int, estado text, total int, listos int, pendientes int)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.anio, cm.mes, cm.estado,
    count(*) filter (where d.estado_efectivo <> 'na')::int as total,
    count(*) filter (where d.estado_efectivo = 'listo')::int as listos,
    count(*) filter (where d.estado_efectivo = 'pendiente')::int as pendientes
  from public.cierre_mes cm
  left join lateral public.app_cierre_detalle(cm.anio, cm.mes) d on true
  where public.soy_administrador() or public.tengo_permiso('cierre.gestionar')
  group by cm.id, cm.anio, cm.mes, cm.estado
  order by cm.anio desc, cm.mes desc;
$$;
grant execute on function public.app_listar_cierres() to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar un requisito a mano (listo / pendiente / na).
-- ---------------------------------------------------------------------------
create or replace function public.fn_marcar_item(p_item uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_estado not in ('pendiente','listo','na') then raise exception 'Estado inválido.'; end if;
  update public.cierre_item
    set estado = p_estado, nota = nullif(btrim(coalesce(p_nota,'')),''),
        marcado_en = now(), marcado_por = auth.uid()
  where id = p_item;
end $$;
grant execute on function public.fn_marcar_item(uuid, text, text) to authenticated;

-- Registrar el metadato de un archivo ya subido a Storage.
create or replace function public.fn_registrar_archivo_cierre(
  p_item uuid, p_path text, p_nombre text, p_tamano bigint, p_mime text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  insert into public.cierre_archivo (item_id, path, nombre, tamano, mime)
    values (p_item, p_path, p_nombre, p_tamano, p_mime) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_registrar_archivo_cierre(uuid, text, text, bigint, text) to authenticated;

create or replace function public.fn_anular_archivo_cierre(p_archivo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.cierre_archivo set estado='anulado', anulado_en=now(), anulado_por=auth.uid()
  where id = p_archivo and estado='activo';
end $$;
grant execute on function public.fn_anular_archivo_cierre(uuid) to authenticated;

-- Archivos activos de un item.
create or replace function public.app_archivos_item(p_item uuid)
returns table(id uuid, nombre text, tamano bigint, mime text, path text, subido_en timestamptz)
language sql stable security definer set search_path = public as $$
  select id, nombre, tamano, mime, path, subido_en from public.cierre_archivo
  where item_id = p_item and estado='activo'
    and (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
  order by subido_en;
$$;
grant execute on function public.app_archivos_item(uuid) to authenticated;

-- Un archivo (para descargar): devuelve el path si hay permiso.
create or replace function public.app_archivo_path(p_archivo uuid)
returns text language sql stable security definer set search_path = public as $$
  select path from public.cierre_archivo
  where id = p_archivo and estado='activo'
    and (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'));
$$;
grant execute on function public.app_archivo_path(uuid) to authenticated;

-- Cerrar / reabrir un mes.
create or replace function public.fn_cerrar_mes(p_cierre uuid, p_cerrar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.cierre_mes
    set estado = case when p_cerrar then 'cerrado' else 'en_proceso' end,
        cerrado_en = case when p_cerrar then now() else null end,
        cerrado_por = case when p_cerrar then auth.uid() else null end
  where id = p_cierre;
end $$;
grant execute on function public.fn_cerrar_mes(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- CRUD del catálogo de requisitos (editable).
-- ---------------------------------------------------------------------------
create or replace function public.app_listar_requisitos()
returns setof public.cierre_requisito language sql stable security definer set search_path = public as $$
  select * from public.cierre_requisito
  where public.soy_administrador() or public.tengo_permiso('cierre.gestionar')
  order by orden, nombre;
$$;
grant execute on function public.app_listar_requisitos() to authenticated;

create or replace function public.fn_guardar_requisito(
  p_id uuid, p_nombre text, p_grupo text, p_alcance text, p_auto text,
  p_centros text[], p_requiere_archivo boolean, p_orden int
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_base text; v_n int := 0;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'El nombre es obligatorio.'; end if;
  if p_alcance not in ('global','centro','cuenta_banco') then raise exception 'Alcance inválido.'; end if;
  if p_id is null then
    v_base := coalesce(public.fn_slug(p_nombre), 'req'); v_cod := v_base;
    while exists (select 1 from public.cierre_requisito where codigo = v_cod) loop
      v_n := v_n+1; v_cod := v_base||'_'||v_n; end loop;
    insert into public.cierre_requisito (codigo, nombre, grupo, alcance, auto_fuente, centros, requiere_archivo, orden)
      values (v_cod, btrim(p_nombre), coalesce(nullif(btrim(p_grupo),''),'Otros'), p_alcance,
              nullif(p_auto,''), p_centros, coalesce(p_requiere_archivo,true), coalesce(p_orden,100))
      returning id into v_id;
    return v_id;
  else
    update public.cierre_requisito
      set nombre=btrim(p_nombre), grupo=coalesce(nullif(btrim(p_grupo),''),'Otros'), alcance=p_alcance,
          auto_fuente=nullif(p_auto,''), centros=p_centros,
          requiere_archivo=coalesce(p_requiere_archivo,true), orden=coalesce(p_orden,100)
    where id = p_id;
    return p_id;
  end if;
end $$;
grant execute on function public.fn_guardar_requisito(uuid, text, text, text, text, text[], boolean, int) to authenticated;

create or replace function public.fn_desactivar_requisito(p_id uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.cierre_requisito set activo = coalesce(p_activo,false) where id = p_id;
end $$;
grant execute on function public.fn_desactivar_requisito(uuid, boolean) to authenticated;

do $$ begin raise notice 'cierre mensual listo.'; end $$;
