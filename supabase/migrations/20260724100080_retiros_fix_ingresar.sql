-- =============================================================================
-- Arreglo del listado de retiros (faltaba filtrar por centro + mes: mostraba
-- todos los meses) y se expone el asiento del gasto enlazado, para poder ver
-- "cuál es el asiento" desde la pantalla de retiros. También se alinea el auto
-- del cierre para contar por el mes al que pertenece el retiro (anio/mes).
-- =============================================================================

drop function if exists public.app_listar_retiros(uuid, int, int);
create function public.app_listar_retiros(p_centro uuid, p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, gasto_id uuid, gasto_desc text, gasto_fecha date,
  gasto_asiento_id uuid, gasto_asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja,
    r.estado, r.gasto_id,
    coalesce(gl.descripcion, gcta.codigo), gl.fecha,
    gl.asiento_id, ga.numero,
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto
      and (g.centro_costo_id = r.centro_id or g.centro_costo_id is null)
      and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha
    limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
    and r.centro_id = p_centro and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.control_caja, r.monto;
$$;
grant execute on function public.app_listar_retiros(uuid, int, int) to authenticated;

-- Auto del cierre: contar por el mes al que pertenece el retiro (anio/mes),
-- consistente con el listado (antes contaba por rango de fecha).
create or replace function public.fn_cierre_auto(
  p_auto text, p_ini date, p_fin date, p_centro uuid, p_cuenta uuid
) returns table(listo boolean, n int, monto numeric, detalle text)
language plpgsql stable set search_path = public as $$
declare v_n int; v_m numeric; v_pend int; v_hay boolean; v_tot int; v_ing int;
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
  elsif p_auto = 'retiros_caja' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing
      from public.retiro_caja
      where centro_id = p_centro
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then
      return query select false, 0, 0::numeric, 'sin_importar'::text;
    else
      return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text;
    end if;
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

do $$ begin raise notice 'retiros: filtro por mes + asiento del gasto listos.'; end $$;
