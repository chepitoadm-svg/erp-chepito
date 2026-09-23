-- =============================================================================
-- fn_detalle_bancario_cuenta: usar el monto de LIBRO (no el del estado de cuenta)
-- para que el detalle del flujo cuadre EXACTO con el número del flujo.
--
-- El flujo (fn_flujo_caja) suma la línea de la cuenta (crédito−débito) en los
-- asientos que tocan efectivo/banco. El detalle debe sumar lo mismo. Antes la
-- parte "conciliada" usaba el monto del ESTADO DE CUENTA (banco), que difiere del
-- libro por el redondeo de conciliación (±₡1). Ahora una sola consulta: la línea
-- de la cuenta en los asientos que tocan efectivo/banco, con el monto de LIBRO;
-- la referencia/estado del banco se muestra si la línea de banco está conciliada.
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
  select
    coalesce(cc.codigo, '(sin centro)'),
    a.fecha,
    -- Referencia del estado de cuenta, si el asiento tiene línea de banco conciliada.
    (select string_agg(distinct e.referencia, ' / ')
       from public.asientos_lineas bl
       join public.cuentas cb on cb.id = bl.cuenta_id
        and (cb.codigo like '11-10-10%' or cb.codigo like '11-10-15%')
       join public.estado_cuenta_lineas e on e.asiento_linea_id = bl.id
      where bl.asiento_id = a.id),
    a.glosa,
    abs(g.debito - g.credito)::numeric(18,2),   -- monto de LIBRO (cuadra con el flujo)
    exists (
      select 1 from public.asientos_lineas bl
      join public.cuentas cb on cb.id = bl.cuenta_id
       and (cb.codigo like '11-10-10%' or cb.codigo like '11-10-15%')
      join public.estado_cuenta_lineas e on e.asiento_linea_id = bl.id
      where bl.asiento_id = a.id
    ),
    a.origen_tipo, a.origen_id, a.id
  from public.asientos_lineas g
  join public.asientos a on a.id = g.asiento_id
  left join public.centros_costo cc on cc.id = g.centro_costo_id
  where g.cuenta_id = p_cuenta
    and a.estado = 'confirmado' and a.tipo <> 'reversion'
    and a.fecha between p_desde and p_hasta
    and (g.debito - g.credito) <> 0
    -- Solo asientos que tocaron efectivo/banco (los que forman el flujo).
    and exists (
      select 1 from public.asientos_lineas bc
      join public.cuentas cbc on cbc.id = bc.cuenta_id
       and (cbc.codigo like '11-10-10%' or cbc.codigo like '11-10-15%')
      where bc.asiento_id = a.id
    )
  order by a.fecha;
$$;
grant execute on function public.fn_detalle_bancario_cuenta(uuid, date, date) to authenticated;

do $$ begin raise notice 'fn_detalle_bancario_cuenta: monto de libro, cuadra exacto con el flujo.'; end $$;
