-- =============================================================================
-- "Retiros / depósitos de caja al banco": se importa el PDF mensual de la app de
-- depósitos (retiros de efectivo para pagar personas, facturas y gastos chicos)
-- y se cotejan igual que los retiros de QuPOS. Reusa la tabla retiro_caja con
-- una columna `fuente` ('qupos' | 'depositos'). Los de depósitos son globales
-- (no por centro): salen de Caja general y el centro se elige al ingresar.
-- =============================================================================

alter table public.retiro_caja add column if not exists fuente text not null default 'qupos';
alter table public.retiro_caja alter column centro_id drop not null;

-- Ampliar el auto del cierre para incluir la fuente de depósitos.
do $$ declare cn text;
begin
  select conname into cn from pg_constraint
  where conrelid = 'public.cierre_requisito'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%auto_fuente%';
  if cn is not null then execute 'alter table public.cierre_requisito drop constraint ' || quote_ident(cn); end if;
end $$;
alter table public.cierre_requisito
  add constraint cierre_requisito_auto_chk
  check (auto_fuente in ('ventas','compras','planilla','conciliacion','retiros_caja','retiros_dep'));

update public.cierre_requisito set auto_fuente = 'retiros_dep', requiere_archivo = true
  where codigo = 'depositos';

-- Import del PDF (filas ya parseadas: fecha, descripcion, panaderia, monto).
create or replace function public.fn_importar_retiros_dep(p_anio int, p_mes int, p_filas jsonb)
returns table(insertados int, duplicados int)
language plpgsql security definer set search_path = public as $$
declare f jsonb; v_h text; v_ins int := 0; v_dup int := 0; v_fecha date; v_monto numeric;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_fecha := (f->>'fecha')::date;
    v_monto := round((f->>'monto')::numeric, 2);
    v_h := md5('dep|' || coalesce(f->>'fecha','') || '|' || coalesce(f->>'descripcion','')
             || '|' || coalesce(f->>'monto','') || '|' || coalesce(f->>'panaderia',''));
    insert into public.retiro_caja (centro_id, anio, mes, fecha, monto, motivo, caja, huella, fuente)
      values (null, p_anio, p_mes, v_fecha, v_monto, nullif(f->>'descripcion',''),
              nullif(f->>'panaderia',''), v_h, 'depositos')
    on conflict (huella) do nothing;
    if found then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
  end loop;
  return query select v_ins, v_dup;
end $$;
grant execute on function public.fn_importar_retiros_dep(int, int, jsonb) to authenticated;

-- Listado de los retiros de depósitos de un mes (todos los centros).
create or replace function public.app_listar_retiros_dep(p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, mov_tipo text, mov_desc text, asiento_id uuid, asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja, r.estado,
    case when r.gasto_id is not null then 'gasto' when r.pago_id is not null then 'pago' else null end,
    case when r.gasto_id is not null then coalesce(gl.descripcion, gcta.codigo)
         when r.pago_id  is not null then 'Pago a ' || pp_prov.nombre end,
    coalesce(gl.asiento_id, pp.asiento_id),
    coalesce(ga.numero, pa.numero),
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join public.pagos_proveedor pp on pp.id = r.pago_id
  left join public.proveedores pp_prov on pp_prov.id = pp.proveedor_id
  left join public.asientos pa on pa.id = pp.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha
    limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
    and r.fuente = 'depositos' and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.monto;
$$;
grant execute on function public.app_listar_retiros_dep(int, int) to authenticated;

-- Auto del cierre: contar los retiros de depósitos por mes.
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
      where fuente = 'qupos' and centro_id = p_centro
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_importar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text; end if;
  elsif p_auto = 'retiros_dep' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing
      from public.retiro_caja
      where fuente = 'depositos'
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_importar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text; end if;
  elsif p_auto = 'conciliacion' then
    select exists (select 1 from public.conciliaciones_banco cb
      where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin)
      into v_hay;
    if not v_hay then return query select false, null::int, null::numeric, 'sin_estado'::text;
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

do $$ begin raise notice 'retiros de depositos (PDF) listos.'; end $$;
