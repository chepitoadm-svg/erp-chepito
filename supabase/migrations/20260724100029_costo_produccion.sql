-- =============================================================================
-- Costo de ventas del mes (versión rápida: costo de MP consumida por sucursal).
-- El ERP lee el consumo de materia prima del app de PRODUCCIÓN por sucursal,
-- lo valoriza con las recetas (en la capa TS, cruzando bases), y postea el
-- costo del mes por centro de costo. Compras es PERPETUO (Debe Inventario
-- 11-60-01 al comprar), así que el costo sale contra ese inventario:
--   Debe  51-30-01-03 Costo de ventas   (centro CH1/CH2/VEX)   monto
--   Haber 11-60-01 Inventario                                  total
-- Da el renglón COSTO DE VENTAS por panadería en el Estado de Resultados.
-- Aproximado: el pan "sin receta" en el app no se costea (mismo hueco del app);
-- se guarda unidades_sin_receta como aviso. El detalle fino por producto
-- vendido (QuPOS × costo) es un paso posterior.
-- =============================================================================

insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('costos', 'registrar', 'costos.registrar', 'Registrar y anular el costo de ventas del mes')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo = 'costos.registrar'
 where r.codigo in ('administrador','contador') on conflict do nothing;

create table public.costo_produccion_mes (
  id             uuid primary key default gen_random_uuid(),
  periodo        date not null, -- primer día del mes
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  total          numeric(18,2) not null default 0,
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz, confirmado_por uuid,
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create unique index costo_produccion_mes_unico on public.costo_produccion_mes (periodo) where estado <> 'anulado';
select public.fn_adjuntar_auditoria('public.costo_produccion_mes');
create trigger trg_costo_mes_no_delete before delete on public.costo_produccion_mes
  for each row execute function public.fn_bloquear_delete();

create table public.costo_produccion_mes_lineas (
  id                    uuid primary key default gen_random_uuid(),
  mes_id                uuid not null references public.costo_produccion_mes(id) on delete cascade,
  centro_costo_id       uuid not null references public.centros_costo(id),
  monto                 numeric(18,2) not null check (monto > 0),
  unidades_sin_receta   numeric(18,2) not null default 0,
  unique (mes_id, centro_costo_id)
);

-- === ALTA (recibe los montos ya calculados en la capa TS) ===================
create or replace function public.fn_crear_costo_mes(p_periodo date, p_lineas jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric(18,2) := 0; r jsonb; v_centro uuid; v_monto numeric(18,2);
begin
  perform public.fn_exigir_permiso('costos.registrar');
  if p_periodo is null then raise exception 'Falta el mes.'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay montos de costo para registrar.'; end if;

  insert into public.costo_produccion_mes (periodo)
  values (date_trunc('month', p_periodo)::date) returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    v_centro := (r->>'centro_costo_id')::uuid;
    v_monto  := round((r->>'monto')::numeric, 2);
    if not exists (select 1 from public.centros_costo where id = v_centro and activo) then
      raise exception 'Centro de costo inválido en el costo del mes.'; end if;
    if v_monto <= 0 then continue; end if;
    insert into public.costo_produccion_mes_lineas (mes_id, centro_costo_id, monto, unidades_sin_receta)
    values (v_id, v_centro, v_monto, round(coalesce((r->>'sin_receta')::numeric, 0), 2));
    v_total := v_total + v_monto;
  end loop;

  if v_total <= 0 then raise exception 'El costo del mes no tiene monto.'; end if;
  update public.costo_produccion_mes set total = v_total where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_costo_mes(date, jsonb) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_costo_mes(p_mes uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_periodo date; v_total numeric(18,2);
  v_cta_costo uuid; v_cta_inv uuid; v_lineas jsonb := '[]'::jsonb; v_asiento uuid; r record;
begin
  perform public.fn_exigir_permiso('costos.registrar');
  select estado, periodo, total into v_estado, v_periodo, v_total
    from public.costo_produccion_mes where id = p_mes;
  if v_estado is null then raise exception 'Costo del mes inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El costo del mes ya está %.', v_estado; end if;

  select id into v_cta_costo from public.cuentas where codigo = '51-30-01-03-00';
  select id into v_cta_inv   from public.cuentas where codigo = '11-60-01-00-00';

  for r in select centro_costo_id, monto from public.costo_produccion_mes_lineas where mes_id = p_mes loop
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', v_cta_costo, 'debito', r.monto, 'centro_costo_id', r.centro_costo_id, 'detalle','Costo de ventas del mes');
  end loop;
  v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_inv, 'credito', v_total, 'detalle','Inventario consumido');

  -- fecha del asiento = último día del mes
  v_asiento := public.fn_postear_asiento(
    'egreso', (date_trunc('month', v_periodo) + interval '1 month - 1 day')::date,
    'Costo de ventas del mes', 'costo_produccion_mes', p_mes, v_lineas);

  update public.costo_produccion_mes set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_mes;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_costo_mes(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_costo_mes(p_mes uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('costos.registrar');
  select estado into v_estado from public.costo_produccion_mes where id = p_mes;
  if v_estado is null then raise exception 'Costo del mes inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un costo confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  perform public.fn_anular_asiento_auto('costo_produccion_mes', p_mes, p_motivo);
  update public.costo_produccion_mes set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_mes;
end $$;
grant execute on function public.fn_anular_costo_mes(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.costo_produccion_mes enable row level security;
alter table public.costo_produccion_mes_lineas enable row level security;
create policy costo_mes_sel on public.costo_produccion_mes for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('costos.registrar'));
create policy costo_mes_wr on public.costo_produccion_mes for all to authenticated
  using (public.tengo_permiso('costos.registrar')) with check (public.tengo_permiso('costos.registrar'));
create policy costo_mes_ln_sel on public.costo_produccion_mes_lineas for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('costos.registrar'));
create policy costo_mes_ln_wr on public.costo_produccion_mes_lineas for all to authenticated
  using (public.tengo_permiso('costos.registrar')) with check (public.tengo_permiso('costos.registrar'));

do $$ begin raise notice 'costo_produccion_mes listo.'; end $$;
