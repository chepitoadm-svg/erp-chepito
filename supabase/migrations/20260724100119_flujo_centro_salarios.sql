-- =============================================================================
-- Flujo por centro: atribuir el PAGO DE PLANILLA a cada panadería.
--
-- Problema: el pago de salarios (origen='planilla_pago') debita "Salarios por
-- pagar" (21-10-11, un pasivo SIN centro) y acredita caja/banco. Como la
-- contrapartida de la caja no lleva centro, esa salida caía toda en "Sin negocio".
--
-- Arreglo (igual que el rastreo de pagos a proveedor): se rastrea cada pago hasta
-- la PROVISIÓN de esa misma planilla (origen='planilla', que sí reparte el gasto
-- de salario por centro: Salarios 61-10-01-08 + No deducibles 64-01-03, con el
-- pool DIV ya resuelto a CH1/CH2), y la salida de caja se reparte con esa misma
-- proporción. Lo que no tenga provisión rastreable queda en "Sin negocio".
--
-- Nota: las cargas sociales patronales (CCSS) se pagan por aparte contra otro
-- pasivo; eso no se toca acá (sigue en "Sin negocio" / financiamiento).
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
  ca as (  -- asientos que tocan caja/banco en el periodo, con su origen
    select distinct a.id, a.origen_tipo, a.origen_id
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
     where a.estado = 'confirmado' and a.tipo <> 'reversion'
       and a.fecha between p_desde and p_hasta
       and l.cuenta_id in (select id from cash)
  ),
  contra as (  -- las líneas de contrapartida (lo que NO es caja)
    select ca.origen_tipo, ca.origen_id,
           cu.codigo, cu.nombre, l.centro_costo_id as centro_id,
           (l.credito - l.debito) as monto
      from public.asientos_lineas l
      join ca on ca.id = l.asiento_id
      join public.cuentas cu on cu.id = l.cuenta_id
     where l.cuenta_id not in (select id from cash)
  ),
  -- 1) Lo que se resuelve por el centro de la propia línea. Se excluyen las líneas
  --    que se rastrean abajo: CxP de pagos a proveedor y "Salarios por pagar" de
  --    los pagos de planilla.
  directo as (
    select centro_id, codigo, nombre, monto
      from contra
     where not (origen_tipo = 'pago_proveedor'
                and (codigo like '21-10-01%' or codigo like '21-10-02%'))
       and not (origen_tipo = 'planilla_pago' and codigo like '21-10-11%')
  ),
  -- 2) Pago a proveedores: repartir por el centro de las facturas pagadas.
  pago as (
    select fc.centro_costo_id as centro_id,
           '21-10-01' as codigo, 'Pago a proveedores (facturas)' as nombre,
           (-1) * sum(ppl.monto) as monto
      from ca
      join public.pagos_proveedor pp on pp.id = ca.origen_id and ca.origen_tipo = 'pago_proveedor'
      join public.pagos_proveedor_lineas ppl on ppl.pago_id = pp.id
      join public.cuentas_por_pagar cxp on cxp.id = ppl.cxp_id
      left join public.facturas_compra fc on fc.id = cxp.factura_id
     group by fc.centro_costo_id
  ),
  -- 3) Pago de planilla: repartir la salida por el gasto de salario de la provisión.
  ppago as (
    select ca.id as asiento_id,
           coalesce(pp.planilla_id, ca.origen_id) as planilla_id,
           sum(l.credito - l.debito) as salida   -- negativo: sale de caja
      from ca
      left join public.planilla_pagos pp on pp.id = ca.origen_id
      join public.asientos_lineas l on l.asiento_id = ca.id
      join public.cuentas cu on cu.id = l.cuenta_id
     where ca.origen_tipo = 'planilla_pago' and cu.codigo like '21-10-11%'
     group by ca.id, coalesce(pp.planilla_id, ca.origen_id)
  ),
  dev_sal as (  -- gasto de salario por centro en la provisión de cada planilla
    select a.origen_id as planilla_id, l.centro_costo_id as centro_id,
           sum(l.debito - l.credito) as gasto
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
  todo as (
    select centro_id, codigo, nombre, monto from directo
    union all
    select centro_id, codigo, nombre, monto from pago
    union all
    select centro_id, codigo, nombre, monto from pago_planilla
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

do $$ begin raise notice 'fn_flujo_caja_centro: ahora reparte el pago de planilla por centro.'; end $$;
