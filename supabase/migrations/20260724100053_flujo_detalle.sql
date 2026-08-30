-- =============================================================================
-- Detalle del FLUJO DE CAJA por cuenta: SOLO los movimientos que tocaron caja/
-- banco (los que suman exactamente el número del flujo), no todo el mayor de la
-- cuenta. Enriquecido con el proveedor (de la factura/pago/gasto/NC ligado) y el
-- origen, para agrupar por proveedor / tipo / centro en la pantalla.
-- =============================================================================

create or replace function public.fn_flujo_detalle(p_cuenta uuid, p_desde date, p_hasta date)
returns table (
  fecha            date,
  referencia       text,
  descripcion      text,
  monto            numeric(18,2),
  proveedor_nombre text,
  origen_tipo      text,
  centro_codigo    text,
  asiento_id       uuid,
  origen_id        uuid
)
language sql stable security definer set search_path = public as $$
  with cash as (
    select id from public.cuentas where codigo like '11-10-10%' or codigo like '11-10-15%'
  ),
  cash_asientos as (
    select distinct a.id
    from public.asientos a
    join public.asientos_lineas l on l.asiento_id = a.id
    where a.estado = 'confirmado' and a.tipo <> 'reversion'
      and a.fecha between p_desde and p_hasta
      and l.cuenta_id in (select id from cash)
  )
  select
    a.fecha,
    ecl.referencia,
    coalesce(ecl.descripcion, a.glosa) as descripcion,
    (g.credito - g.debito)::numeric(18,2) as monto,
    pr.nombre as proveedor_nombre,
    a.origen_tipo,
    cc.codigo as centro_codigo,
    a.id, a.origen_id
  from public.asientos_lineas g
  join public.asientos a on a.id = g.asiento_id
  left join public.centros_costo cc on cc.id = g.centro_costo_id
  -- Descripción real del banco: la línea del estado de cuenta conciliada con la
  -- línea de caja del mismo asiento (si la hay).
  left join lateral (
    select e.referencia, e.descripcion
    from public.asientos_lineas bl
    join public.cuentas cb on cb.id = bl.cuenta_id
     and (cb.codigo like '11-10-10%' or cb.codigo like '11-10-15%')
    join public.estado_cuenta_lineas e on e.asiento_linea_id = bl.id
    where bl.asiento_id = a.id
    limit 1
  ) ecl on true
  -- Proveedor según el origen del asiento.
  left join public.facturas_compra fc     on a.origen_tipo = 'factura_compra'     and fc.id = a.origen_id
  left join public.gastos ga              on a.origen_tipo = 'gasto'              and ga.id = a.origen_id
  left join public.pagos_proveedor pp     on a.origen_tipo = 'pago_proveedor'     and pp.id = a.origen_id
  left join public.notas_credito_compra nc on a.origen_tipo = 'nota_credito_compra' and nc.id = a.origen_id
  left join public.proveedores pr
    on pr.id = coalesce(fc.proveedor_id, ga.proveedor_id, pp.proveedor_id, nc.proveedor_id)
  where g.cuenta_id = p_cuenta
    and g.asiento_id in (select id from cash_asientos)
    and (g.credito - g.debito) <> 0
  order by a.fecha;
$$;
grant execute on function public.fn_flujo_detalle(uuid, date, date) to authenticated;

do $$ begin raise notice 'fn_flujo_detalle lista.'; end $$;
