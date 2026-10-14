-- =============================================================================
-- Flujo por centro: atribuir el IVA COBRADO EN VENTAS a la panadería que vendió.
--
-- En una venta del día: se debita caja/datáfono, se acreditan Ventas (41, con
-- centro) y el "Impuesto de ventas cobrado" (21-10-15-04, SIN centro). Esa línea
-- de IVA caía en "Sin negocio", pero es plata que entró a la panadería (el cliente
-- pagó neto + IVA). Se atribuye al centro de las Ventas del mismo asiento (cada
-- venta_dia tiene un solo centro de ventas).
--
-- Único cambio vs 100120: CTEs venta_centro + iva_venta, exclusión en "directo"
-- del IVA de venta_dia, y su inclusión en "todo".
-- Nota: el PAGO del IVA a Hacienda (remesa) no es venta_dia, así que sigue en
-- "Sin negocio" (es una obligación de la empresa, no una operación de la sucursal).
-- =============================================================================

create or replace function public.fn_flujo_caja_centro(p_desde date, p_hasta date)
returns table(
  centro_codigo text, centro_nombre text,
  categoria text, tipo text,
  cuenta_codigo text, cuenta_nombre text, monto numeric
)
language sql stable as $function$
  with cash as (
    select id from public.cuentas
     where (codigo like '11-10-10%' or codigo like '11-10-15%' or codigo like '11-30-02%')
  ),
  ca as (
    select distinct a.id, a.origen_tipo, a.origen_id
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
     where a.estado = 'confirmado' and a.tipo <> 'reversion'
       and a.fecha between p_desde and p_hasta
       and l.cuenta_id in (select id from cash)
  ),
  contra as (
    select ca.origen_tipo, ca.origen_id,
           cu.codigo, cu.nombre, l.centro_costo_id as centro_id,
           (l.credito - l.debito) as monto
      from public.asientos_lineas l
      join ca on ca.id = l.asiento_id
      join public.cuentas cu on cu.id = l.cuenta_id
     where l.cuenta_id not in (select id from cash)
  ),
  -- Se excluyen las líneas que se rastrean aparte: CxP de pagos a proveedor,
  -- "Salarios por pagar" de planilla, e IVA cobrado de las ventas del día.
  directo as (
    select centro_id, codigo, nombre, monto
      from contra
     where not (coalesce(origen_tipo, '') = 'pago_proveedor'
                and (codigo like '21-10-01%' or codigo like '21-10-02%'))
       and not (coalesce(origen_tipo, '') = 'planilla_pago' and codigo like '21-10-11%')
       and not (coalesce(origen_tipo, '') = 'venta_dia' and codigo like '21-10-15-04%')
  ),
  pago as (
    select coalesce(fc.centro_costo_id, g.centro_costo_id) as centro_id,
           '21-10-01' as codigo, 'Pago a proveedores y gastos' as nombre,
           (-1) * sum(ppl.monto) as monto
      from ca
      join public.pagos_proveedor pp on pp.id = ca.origen_id and ca.origen_tipo = 'pago_proveedor'
      join public.pagos_proveedor_lineas ppl on ppl.pago_id = pp.id
      join public.cuentas_por_pagar cxp on cxp.id = ppl.cxp_id
      left join public.facturas_compra fc on fc.id = cxp.factura_id
      left join public.gastos g on g.id = cxp.gasto_id
     group by coalesce(fc.centro_costo_id, g.centro_costo_id)
  ),
  ppago as (
    select ca.id as asiento_id,
           coalesce(pp.planilla_id, ca.origen_id) as planilla_id,
           sum(l.credito - l.debito) as salida
      from ca
      left join public.planilla_pagos pp on pp.id = ca.origen_id
      join public.asientos_lineas l on l.asiento_id = ca.id
      join public.cuentas cu on cu.id = l.cuenta_id
     where ca.origen_tipo = 'planilla_pago' and cu.codigo like '21-10-11%'
     group by ca.id, coalesce(pp.planilla_id, ca.origen_id)
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
    select ds.centro_id, '61-10-01' as codigo, 'Planilla / salarios (neto pagado)' as nombre,
           sum(pp.salida * ds.gasto / dt.total) as monto
      from ppago pp
      join dev_tot dt on dt.planilla_id = pp.planilla_id
      join dev_sal ds on ds.planilla_id = pp.planilla_id
     group by ds.centro_id
    union all
    select null::uuid, '61-10-01', 'Planilla / salarios (neto pagado)', sum(pp.salida)
      from ppago pp
     where not exists (select 1 from dev_tot dt where dt.planilla_id = pp.planilla_id)
  ),
  -- Centro de las ventas de cada asiento de venta del día (hay uno solo).
  venta_centro as (
    select l.asiento_id, (max(l.centro_costo_id::text))::uuid as centro_id
      from public.asientos_lineas l
      join ca on ca.id = l.asiento_id and ca.origen_tipo = 'venta_dia'
      join public.cuentas cu on cu.id = l.cuenta_id
     where cu.codigo like '41%' and l.centro_costo_id is not null
     group by l.asiento_id
  ),
  -- IVA cobrado en ventas: va al centro de la venta (si no se encuentra, Sin negocio).
  iva_venta as (
    select vc.centro_id, l.cuenta_id, cu.codigo, cu.nombre, (l.credito - l.debito) as monto
      from public.asientos_lineas l
      join ca on ca.id = l.asiento_id and ca.origen_tipo = 'venta_dia'
      join public.cuentas cu on cu.id = l.cuenta_id
      left join venta_centro vc on vc.asiento_id = l.asiento_id
     where cu.codigo like '21-10-15-04%'
  ),
  todo as (
    select centro_id, codigo, nombre, monto from directo
    union all
    select centro_id, codigo, nombre, monto from pago
    union all
    select centro_id, codigo, nombre, monto from pago_planilla
    union all
    select centro_id, codigo, nombre, monto from iva_venta
  )
  select
    coalesce(cc.codigo, 'SINNEG') as centro_codigo,
    coalesce(cc.nombre, 'Sin negocio (préstamos, IVA, banco)') as centro_nombre,
    case
      when t.codigo like '41%' then 'Ventas cobradas'
      when t.codigo like '11-20%' then 'Cobros a clientes (CxC)'
      when t.codigo like '21-10-15%' then 'IVA / impuestos'
      when t.codigo like '21-10-01%' or t.codigo like '21-10-02%' then 'Pago a proveedores'
      when t.codigo like '51%' then 'Compras / mercadería'
      when t.codigo like '61-10-01%' then 'Planilla / salarios'
      when t.codigo like '61-10-14%' then 'Servicios (agua, luz, tel.)'
      when t.codigo like '61-10-28%' then 'Alquileres'
      when t.codigo like '61-10-31%' then 'Combustible'
      when t.codigo like '61%' then 'Gastos operativos'
      when t.codigo like '62%' then 'Gastos financieros'
      when t.codigo like '63%' or t.codigo like '64%' then 'Otros gastos'
      when t.codigo like '31%' then 'Capital / retiros'
      when t.codigo like '22%' or t.codigo like '24%' or t.codigo like '25%' then 'Préstamos / financiamiento'
      when t.codigo like '11-30%' then 'Tarjetas (depósitos)'
      when t.codigo like '42%' or t.codigo like '43%' or t.codigo like '52%' then 'Otros ingresos'
      else 'Otros movimientos'
    end as categoria,
    case when sum(t.monto) >= 0 then 'entrada' else 'salida' end as tipo,
    t.codigo, t.nombre,
    sum(t.monto)::numeric(18,2) as monto
  from todo t
  left join public.centros_costo cc on cc.id = t.centro_id
  group by cc.codigo, cc.nombre, t.codigo, t.nombre
  having sum(t.monto) <> 0
  order by cc.codigo, t.codigo;
$function$;

grant execute on function public.fn_flujo_caja_centro(date, date) to authenticated;

do $$ begin raise notice 'fn_flujo_caja_centro: IVA de ventas atribuido a la panadería.'; end $$;
