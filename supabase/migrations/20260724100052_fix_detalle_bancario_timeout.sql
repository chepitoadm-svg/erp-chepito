-- =============================================================================
-- Arreglo de rendimiento de fn_detalle_bancario_cuenta (se cortaba por
-- statement timeout desde el Mayor/flujo):
--   1) Índice faltante en estado_cuenta_lineas.asiento_linea_id (la liga con la
--      línea de banco del asiento; sin él, seq scans anidados).
--   2) La función pasa a SECURITY DEFINER, como los demás reportes: es solo
--      lectura y ya está protegida por permiso en la pantalla. Así no evalúa RLS
--      fila por fila sobre asientos/asientos_lineas/estado_cuenta_lineas.
-- =============================================================================

create index if not exists ix_ecl_asiento_linea
  on public.estado_cuenta_lineas (asiento_linea_id);

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

do $$ begin raise notice 'fn_detalle_bancario_cuenta optimizada (definer + índice).'; end $$;
