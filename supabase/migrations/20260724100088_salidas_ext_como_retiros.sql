-- =============================================================================
-- Las SALIDAS de ventas externas pasan a usar la misma maquinaria de "retiros":
-- cada salida es un retiro_caja con fuente='venta_ext', para cotejar
-- ingresado/pendiente e ingresarla como gasto / pago de factura / pago de
-- planilla, con su asiento — igual que los retiros de caja/depósitos.
-- Se agrega ALTA MANUAL (las salidas se escriben a mano) y BORRAR (si sigue
-- pendiente). Se migran las salidas ya cargadas (venta_ext_salida) a retiro_caja.
-- =============================================================================

-- Alta manual de un retiro (para salidas de ventas externas, que se tipean).
create or replace function public.fn_agregar_retiro_manual(p_fecha date, p_monto numeric, p_motivo text, p_fuente text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.tengo_permiso('cierre.gestionar') or public.tengo_permiso('ventas.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  if p_fecha is null then raise exception 'Poné la fecha.'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  insert into public.retiro_caja (centro_id, anio, mes, fecha, monto, motivo, huella, fuente)
    values (null, extract(year from p_fecha)::int, extract(month from p_fecha)::int, p_fecha,
            round(p_monto,2), nullif(btrim(coalesce(p_motivo,'')),''), gen_random_uuid()::text,
            coalesce(nullif(p_fuente,''),'venta_ext'))
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_agregar_retiro_manual(date, numeric, text, text) to authenticated;

-- Borrar un retiro (solo si sigue pendiente y sin movimiento enlazado).
create or replace function public.fn_borrar_retiro(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_g uuid; v_p uuid; v_pp uuid;
begin
  if not (public.tengo_permiso('cierre.gestionar') or public.tengo_permiso('ventas.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  select estado, gasto_id, pago_id, planilla_pago_id into v_estado, v_g, v_p, v_pp
    from public.retiro_caja where id = p_id;
  if v_estado is null then return; end if;
  if v_g is not null or v_p is not null or v_pp is not null then
    raise exception 'Ya está ingresado; deshacelo antes de borrar.'; end if;
  delete from public.retiro_caja where id = p_id;
end $$;
grant execute on function public.fn_borrar_retiro(uuid) to authenticated;

-- Listado de las salidas de ventas externas (fuente='venta_ext') de un mes.
drop function if exists public.app_listar_retiros_ext(int, int);
create function public.app_listar_retiros_ext(p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, mov_tipo text, mov_desc text, asiento_id uuid, asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja, r.estado,
    case when r.gasto_id is not null then 'gasto'
         when r.pago_id is not null then 'pago'
         when r.planilla_pago_id is not null then 'planilla' else null end,
    case when r.gasto_id is not null then coalesce(gl.descripcion, gcta.codigo)
         when r.pago_id  is not null then 'Pago a ' || pp_prov.nombre
         when r.planilla_pago_id is not null then 'Pago planilla ' || coalesce(pl.titulo,'') end,
    coalesce(gl.asiento_id, pp.asiento_id, plp.asiento_id),
    coalesce(ga.numero, pa.numero, pla.numero),
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join public.pagos_proveedor pp on pp.id = r.pago_id
  left join public.proveedores pp_prov on pp_prov.id = pp.proveedor_id
  left join public.asientos pa on pa.id = pp.asiento_id
  left join public.planilla_pagos plp on plp.id = r.planilla_pago_id
  left join public.planilla pl on pl.id = plp.planilla_id
  left join public.asientos pla on pla.id = plp.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar') or public.tengo_permiso('ventas.registrar'))
    and r.fuente = 'venta_ext' and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.creado_en;
$$;
grant execute on function public.app_listar_retiros_ext(int, int) to authenticated;

-- Migrar las salidas ya cargadas (una sola vez).
insert into public.retiro_caja (centro_id, anio, mes, fecha, monto, motivo, huella, fuente)
  select null, extract(year from s.fecha)::int, extract(month from s.fecha)::int, s.fecha, s.monto,
         s.descripcion, gen_random_uuid()::text, 'venta_ext'
  from public.venta_ext_salida s
  where not exists (
    select 1 from public.retiro_caja r
    where r.fuente = 'venta_ext' and r.fecha = s.fecha and r.monto = s.monto
      and coalesce(r.motivo,'') = coalesce(s.descripcion,'')
  );

do $$ begin raise notice 'salidas ext como retiros listo.'; end $$;
