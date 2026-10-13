-- =============================================================================
-- Flujo por centro: DETALLE de una línea (drill-down). Dado un centro y una
-- cuenta (la línea que se toca en la pantalla), devuelve los movimientos
-- individuales que la componen, con la MISMA atribución que fn_flujo_caja_centro
-- (directo por centro de la línea; pago a proveedores/gastos rastreado a la
-- factura/gasto; planilla repartida por el gasto de salario de la provisión).
-- =============================================================================

create or replace function public.fn_flujo_caja_centro_detalle(
  p_desde date, p_hasta date, p_centro_codigo text, p_cuenta_codigo text
)
returns table(
  fecha date, numero text, origen_tipo text, origen_id uuid, concepto text, monto numeric
)
language sql stable as $function$
  with cash as (
    select id from public.cuentas
     where (codigo like '11-10-10%' or codigo like '11-10-15%' or codigo like '11-30-02%')
  ),
  ca as (
    select distinct a.id, a.fecha, a.numero, a.glosa, a.origen_tipo, a.origen_id
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
     where a.estado = 'confirmado' and a.tipo <> 'reversion'
       and a.fecha between p_desde and p_hasta
       and l.cuenta_id in (select id from cash)
  ),
  contra as (
    select ca.fecha, ca.numero, ca.glosa, ca.origen_tipo, ca.origen_id,
           cu.codigo, l.centro_costo_id as centro_id, (l.credito - l.debito) as monto
      from public.asientos_lineas l
      join ca on ca.id = l.asiento_id
      join public.cuentas cu on cu.id = l.cuenta_id
     where l.cuenta_id not in (select id from cash)
  ),
  directo as (
    select fecha, numero, origen_tipo, origen_id, codigo, centro_id, glosa, monto
      from contra
     where not (origen_tipo = 'pago_proveedor' and (codigo like '21-10-01%' or codigo like '21-10-02%'))
       and not (origen_tipo = 'planilla_pago' and codigo like '21-10-11%')
  ),
  pago as (
    select ca.fecha, ca.numero, ca.origen_id,
           coalesce(fc.centro_costo_id, g.centro_costo_id) as centro_id,
           (max(cxp.proveedor_id::text))::uuid as proveedor_id,
           (-1) * sum(ppl.monto) as monto
      from ca
      join public.pagos_proveedor pp on pp.id = ca.origen_id and ca.origen_tipo = 'pago_proveedor'
      join public.pagos_proveedor_lineas ppl on ppl.pago_id = pp.id
      join public.cuentas_por_pagar cxp on cxp.id = ppl.cxp_id
      left join public.facturas_compra fc on fc.id = cxp.factura_id
      left join public.gastos g on g.id = cxp.gasto_id
     group by ca.fecha, ca.numero, ca.origen_id, coalesce(fc.centro_costo_id, g.centro_costo_id)
  ),
  ppago as (
    select ca.fecha, ca.numero, ca.origen_id,
           coalesce(pp.planilla_id, ca.origen_id) as planilla_id,
           sum(l.credito - l.debito) as salida
      from ca
      left join public.planilla_pagos pp on pp.id = ca.origen_id
      join public.asientos_lineas l on l.asiento_id = ca.id
      join public.cuentas cu on cu.id = l.cuenta_id
     where ca.origen_tipo = 'planilla_pago' and cu.codigo like '21-10-11%'
     group by ca.fecha, ca.numero, ca.origen_id, coalesce(pp.planilla_id, ca.origen_id)
  ),
  dev_sal as (
    select a.origen_id as planilla_id, l.centro_costo_id as centro_id, sum(l.debito - l.credito) as gasto
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
      join public.cuentas cu on cu.id = l.cuenta_id
     where a.origen_tipo = 'planilla' and a.estado = 'confirmado'
       and (cu.codigo like '61-10-01-08%' or cu.codigo like '64-01-03%')
       and l.centro_costo_id is not null
     group by a.origen_id, l.centro_costo_id
  ),
  dev_tot as (
    select planilla_id, sum(gasto) as total from dev_sal group by planilla_id having sum(gasto) <> 0
  ),
  pago_planilla as (
    select pp.fecha, pp.numero, pp.origen_id, ds.centro_id,
           sum(pp.salida * ds.gasto / dt.total) as monto
      from ppago pp
      join dev_tot dt on dt.planilla_id = pp.planilla_id
      join dev_sal ds on ds.planilla_id = pp.planilla_id
     group by pp.fecha, pp.numero, pp.origen_id, ds.centro_id
    union all
    select pp.fecha, pp.numero, pp.origen_id, null::uuid, sum(pp.salida)
      from ppago pp
     where not exists (select 1 from dev_tot dt where dt.planilla_id = pp.planilla_id)
     group by pp.fecha, pp.numero, pp.origen_id
  )
  -- DIRECTO (ventas, gastos, servicios, financieros, otros)
  select d.fecha, d.numero::text, d.origen_tipo, d.origen_id,
         coalesce(
           case d.origen_tipo
             when 'gasto' then (select g.descripcion from public.gastos g where g.id = d.origen_id)
             when 'factura_compra' then (select p.nombre from public.facturas_compra f
                                          join public.proveedores p on p.id = f.proveedor_id where f.id = d.origen_id)
             when 'venta_dia' then 'Venta del día'
             else null
           end, nullif(btrim(d.glosa), ''), 'Movimiento'
         ) as concepto,
         abs(d.monto)::numeric(18,2) as monto
    from directo d
    left join public.centros_costo cc on cc.id = d.centro_id
   where coalesce(cc.codigo, 'SINNEG') = p_centro_codigo
     and d.codigo like p_cuenta_codigo || '%'
     and round(d.monto, 2) <> 0
  union all
  -- PAGO A PROVEEDORES Y GASTOS (cuenta virtual 21-10-01)
  select pg.fecha, pg.numero::text, 'pago_proveedor'::text, pg.origen_id,
         coalesce((select p.nombre from public.proveedores p where p.id = pg.proveedor_id), 'Pago a proveedores') as concepto,
         abs(pg.monto)::numeric(18,2) as monto
    from pago pg
    left join public.centros_costo cc on cc.id = pg.centro_id
   where coalesce(cc.codigo, 'SINNEG') = p_centro_codigo
     and '21-10-01' like p_cuenta_codigo || '%'
     and round(pg.monto, 2) <> 0
  union all
  -- PLANILLA / SALARIOS (cuenta virtual 61-10-01)
  select pl.fecha, pl.numero::text, 'planilla_pago'::text, pl.origen_id,
         'Planilla / salarios (neto pagado)'::text as concepto,
         abs(pl.monto)::numeric(18,2) as monto
    from pago_planilla pl
    left join public.centros_costo cc on cc.id = pl.centro_id
   where coalesce(cc.codigo, 'SINNEG') = p_centro_codigo
     and '61-10-01' like p_cuenta_codigo || '%'
     and round(pl.monto, 2) <> 0
  order by 1, 6 desc;
$function$;

grant execute on function public.fn_flujo_caja_centro_detalle(date, date, text, text) to authenticated;

do $$ begin raise notice 'fn_flujo_caja_centro_detalle creada.'; end $$;
