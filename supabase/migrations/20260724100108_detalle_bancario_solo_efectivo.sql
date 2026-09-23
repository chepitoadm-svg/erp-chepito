-- =============================================================================
-- Fix: fn_detalle_bancario_cuenta incluía movimientos que NO tocaron efectivo.
--
-- El detalle del flujo (mayor con detalle=banco) debe mostrar SOLO los movimientos
-- de la cuenta que forman el número del flujo, es decir, los que van contra una
-- cuenta de efectivo/banco (Caja 11-10-10 o Bancos 11-10-15). La parte 2 traía
-- CUALQUIER movimiento sin línea de banco conciliada, así que colaba las
-- provisiones (p.ej. planilla: Debe Gasto / Haber Salarios por pagar) y pagos que
-- no fueron en efectivo (p.ej. contra CxC funcionarios). Por eso el total del
-- detalle (₡5,5M) no cuadraba con el flujo (₡1,9M).
--
-- Ahora la parte 2 exige que el asiento TENGA una línea de efectivo/banco (aunque
-- no esté conciliada con el estado de cuenta). Así el detalle suma el mismo
-- efectivo que el flujo. (Puede quedar una diferencia de céntimos en movimientos
-- ya conciliados: el detalle muestra el monto del ESTADO DE CUENTA y el flujo el
-- del LIBRO, que difieren por el redondeo de conciliación.)
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
language sql stable security definer set search_path = public as $$
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

  -- 2) Movimientos que tocaron efectivo/banco pero SIN línea de banco conciliada.
  --    (Antes traía cualquier movimiento sin conciliar; ahora exige línea de
  --    efectivo/banco, para no colar provisiones ni pagos no-efectivo.)
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
    and exists (
      select 1 from public.asientos_lineas bc
      join public.cuentas cbc on cbc.id = bc.cuenta_id
       and (cbc.codigo like '11-10-10%' or cbc.codigo like '11-10-15%')
      where bc.asiento_id = a.id
    )
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

do $$ begin raise notice 'fn_detalle_bancario_cuenta: solo movimientos de efectivo/banco (cuadra con el flujo).'; end $$;
