-- =============================================================================
-- Flujo de caja POR CENTRO DE COSTO (por panadería). Igual que fn_flujo_caja,
-- pero atribuye cada entrada/salida de caja al negocio de su contrapartida:
--   - Ventas y gastos directos → el centro de la propia línea.
--   - Pago a proveedores (la línea de CxP no lleva centro) → se RASTREA a la(s)
--     factura(s) pagada(s) y se reparte por el centro de cada factura.
--   - Lo que no es de un negocio (depósitos de tarjeta por el datáfono, préstamos,
--     traslados, IVA) cae en "General / sin centro".
-- Convención: monto = crédito - débito  (+ = entra a caja, - = sale de caja).
-- Devuelve lo mismo que fn_flujo_caja + centro_codigo/centro_nombre.
-- =============================================================================

create or replace function public.fn_flujo_caja_centro(p_desde date, p_hasta date)
returns table(
  centro_codigo text, centro_nombre text,
  categoria text, tipo text,
  cuenta_codigo text, cuenta_nombre text, monto numeric
)
language sql stable as $function$
  with cash as (
    -- Caja, bancos Y datáfono (11-30-02): así una venta con TARJETA le cuenta como
    -- entrada a la panadería que la vendió (la venta debita datáfono/Haber ventas con
    -- su centro), y el depósito del banco al datáfono queda como traslado interno.
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
  -- 1) Todo lo que se resuelve por el centro de la propia línea
  --    (se excluye la línea de CxP de los pagos a proveedor: esa se rastrea abajo).
  directo as (
    select centro_id, codigo, nombre, monto
      from contra
     where not (origen_tipo = 'pago_proveedor'
                and (codigo like '21-10-01%' or codigo like '21-10-02%'))
  ),
  -- 2) Pago a proveedores: repartir la salida por el centro de las facturas pagadas
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
  todo as (
    select centro_id, codigo, nombre, monto from directo
    union all
    select centro_id, codigo, nombre, monto from pago
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

do $$ begin raise notice 'fn_flujo_caja_centro creada.'; end $$;
