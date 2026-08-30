-- =============================================================================
-- Snapshot del desecho por (panadería, mes): guarda el detalle artículo por
-- artículo del análisis, para consultarlo mes a mes sin volver a subir el Excel.
--
-- Es una HOJA DE TRABAJO recalculable a partir del Excel de movimientos, NO un
-- libro contable. El libro real (inmutable, anulable) es reclasificacion_costo_mes
-- + su asiento. Por eso acá se permite re-guardar el mes (reemplaza el snapshot):
--   desecho_mes     = cabecera (una por centro+mes): totales + si ya está posteado
--   desecho_detalle = una línea por (código, tipo de movimiento) del Excel
-- =============================================================================

create table public.desecho_mes (
  id              uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references public.centros_costo(id),
  periodo         date not null,                 -- primer día del mes
  bodega          text,
  compras_total   numeric(18,2) not null default 0,  -- costo neto del mes
  merma           numeric(18,2) not null default 0,
  autoconsumo     numeric(18,2) not null default 0,
  costo_vendido   numeric(18,2) not null default 0,
  reclasif_id     uuid references public.reclasificacion_costo_mes(id),
  posteado        boolean not null default false,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz, actualizado_por uuid
);
create unique index desecho_mes_unico on public.desecho_mes (centro_costo_id, periodo);
select public.fn_adjuntar_auditoria('public.desecho_mes');

create table public.desecho_detalle (
  id             uuid primary key default gen_random_uuid(),
  desecho_mes_id uuid not null references public.desecho_mes(id) on delete cascade,
  codigo         text not null,
  nombre         text,
  tipo_mov       text,
  clase          text not null default 'ignorar' check (clase in ('merma','autoconsumo','ignorar')),
  cantidad       numeric(18,3) not null default 0,
  costo_unitario numeric(18,4),                  -- null = sin receta/costo
  costo_total    numeric(18,2),
  creado_en      timestamptz not null default now()
);
create index desecho_detalle_mes on public.desecho_detalle (desecho_mes_id);

-- Guarda (o reemplaza) el snapshot del mes. Deduce si ya está posteado mirando
-- la reclasificación contable confirmada de ese centro+mes.
create or replace function public.fn_guardar_desecho(
  p_centro uuid, p_periodo date, p_bodega text,
  p_compras numeric, p_merma numeric, p_auto numeric, p_vendido numeric,
  p_lineas jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ini date; v_id uuid; v_recl uuid; v_posteado boolean;
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'Elegí una panadería (Chepito 1 o 2).'; end if;
  v_ini := date_trunc('month', p_periodo)::date;

  select id into v_recl
    from public.reclasificacion_costo_mes
   where centro_costo_id = p_centro and periodo = v_ini and estado = 'confirmado'
   order by creado_en desc limit 1;
  v_posteado := v_recl is not null;

  insert into public.desecho_mes
    (centro_costo_id, periodo, bodega, compras_total, merma, autoconsumo, costo_vendido, reclasif_id, posteado)
  values
    (p_centro, v_ini, p_bodega, round(coalesce(p_compras,0),2), round(coalesce(p_merma,0),2),
     round(coalesce(p_auto,0),2), round(coalesce(p_vendido,0),2), v_recl, v_posteado)
  on conflict (centro_costo_id, periodo) do update set
    bodega = excluded.bodega, compras_total = excluded.compras_total, merma = excluded.merma,
    autoconsumo = excluded.autoconsumo, costo_vendido = excluded.costo_vendido,
    reclasif_id = excluded.reclasif_id, posteado = excluded.posteado,
    actualizado_en = now(), actualizado_por = auth.uid()
  returning id into v_id;

  -- Reemplaza el detalle (hoja de trabajo recalculable).
  delete from public.desecho_detalle where desecho_mes_id = v_id;
  insert into public.desecho_detalle
    (desecho_mes_id, codigo, nombre, tipo_mov, clase, cantidad, costo_unitario, costo_total)
  select v_id, x.codigo, x.nombre, x.tipo_mov,
         coalesce(x.clase, 'ignorar'), coalesce(x.cantidad, 0), x.costo_unitario, x.costo_total
    from jsonb_to_recordset(coalesce(p_lineas, '[]'::jsonb)) as x(
      codigo text, nombre text, tipo_mov text, clase text,
      cantidad numeric, costo_unitario numeric, costo_total numeric);

  return v_id;
end $$;
grant execute on function public.fn_guardar_desecho(uuid, date, text, numeric, numeric, numeric, numeric, jsonb) to authenticated;

alter table public.desecho_mes enable row level security;
alter table public.desecho_detalle enable row level security;

create policy dm_sel on public.desecho_mes for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));
create policy dm_wr on public.desecho_mes for all to authenticated
  using (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'))
  with check (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));

create policy dd_sel on public.desecho_detalle for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));
create policy dd_wr on public.desecho_detalle for all to authenticated
  using (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'))
  with check (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));

do $$ begin raise notice 'desecho_mes + desecho_detalle listos.'; end $$;
