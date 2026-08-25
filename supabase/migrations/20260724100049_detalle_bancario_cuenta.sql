-- =============================================================================
-- Detalle bancario de una cuenta, agrupable por centro de costo. Para el
-- drill-down del flujo de caja: por cada movimiento de la cuenta (ej. un gasto),
-- se buscan las líneas REALES del estado de cuenta conciliadas con la línea de
-- banco de ese asiento. Así "Otros gastos" muestra los pagos reales (ASEMECO,
-- NETFLIX, …) con su centro de costo. Si el movimiento no está conciliado (o no
-- salió por banco), se muestra el propio movimiento como una línea.
-- =============================================================================

create or replace function public.fn_detalle_bancario_cuenta(p_cuenta uuid, p_desde date, p_hasta date)
returns table (
  centro_codigo text,
  fecha         date,
  referencia    text,
  descripcion   text,
  monto         numeric(18,2),
  conciliado    boolean,
  origen_tipo   text,
  origen_id     uuid,
  asiento_id    uuid
)
language sql stable security invoker as $$
  -- 1) Líneas del estado de cuenta conciliadas con la línea de banco del asiento.
  select
    coalesce(cc.codigo, '(sin centro)'),
    e.fecha, e.referencia, e.descripcion,
    (e.debito + e.credito)::numeric(18,2),
    true, a.origen_tipo, a.origen_id, a.id
  from public.asientos_lineas g
  join public.asientos a on a.id = g.asiento_id
  left join public.centros_costo cc on cc.id = g.centro_costo_id
  join public.asientos_lineas bl on bl.asiento_id = a.id
  join public.cuentas cb on cb.id = bl.cuenta_id
   and (cb.codigo like '11-10-10%' or cb.codigo like '11-10-15%')
  join public.estado_cuenta_lineas e on e.asiento_linea_id = bl.id
  where g.cuenta_id = p_cuenta
    and a.estado = 'confirmado' and a.tipo <> 'reversion'
    and a.fecha between p_desde and p_hasta

  union all

  -- 2) Movimientos sin línea de banco conciliada: el propio movimiento.
  select
    coalesce(cc.codigo, '(sin centro)'),
    a.fecha, null, a.glosa,
    abs(g.debito - g.credito)::numeric(18,2),
    false, a.origen_tipo, a.origen_id, a.id
  from public.asientos_lineas g
  join public.asientos a on a.id = g.asiento_id
  left join public.centros_costo cc on cc.id = g.centro_costo_id
  where g.cuenta_id = p_cuenta
    and a.estado = 'confirmado' and a.tipo <> 'reversion'
    and a.fecha between p_desde and p_hasta
    and (g.debito - g.credito) <> 0
    and not exists (
      select 1 from public.asientos_lineas bl
      join public.cuentas cb on cb.id = bl.cuenta_id
       and (cb.codigo like '11-10-10%' or cb.codigo like '11-10-15%')
      join public.estado_cuenta_lineas e on e.asiento_linea_id = bl.id
      where bl.asiento_id = a.id
    )
  order by 1, 2;
$$;
grant execute on function public.fn_detalle_bancario_cuenta(uuid, date, date) to authenticated;

do $$ begin raise notice 'fn_detalle_bancario_cuenta lista.'; end $$;
