-- =============================================================================
-- Libro Mayor: opción de ocultar los asientos anulados y sus reversiones.
--
-- Un gasto editado deja el original ('anulado') + su reversión ('confirmado'),
-- que netean a cero. En el saldo corrido eso se ve como una resta y una suma
-- (confunde: "me resta el asiento de anulación"). Con p_excluir_anulados = true
-- el Mayor muestra solo lo vigente (confirmado, no reversión); el saldo final es
-- el mismo pero sin el vaivén. Los reportes (Estado de Resultados, Flujo) hacen
-- drill-down así por defecto; el Libro Mayor puede mostrarlos con un check.
-- =============================================================================

drop function if exists public.app_mayor_cuenta(uuid, date, date, boolean);
create or replace function public.app_mayor_cuenta(
  p_cuenta_id uuid,
  p_desde     date default null,
  p_hasta     date default null,
  p_excluir_prorrateo boolean default false,
  p_excluir_anulados  boolean default false
)
returns table (
  fecha           date,
  asiento_id      uuid,
  asiento_tipo    text,
  asiento_numero  int,
  asiento_estado  text,
  glosa           text,
  centro_codigo   text,
  origen_tipo     text,
  origen_id       uuid,
  debito          numeric(18,2),
  credito         numeric(18,2),
  saldo           numeric(18,2)
)
language sql
stable
security invoker
as $$
  with movimientos as (
    select a.fecha, a.id as asiento_id, a.tipo as asiento_tipo, a.numero as asiento_numero,
           a.estado as asiento_estado, a.glosa, cc.codigo as centro_codigo,
           a.origen_tipo, a.origen_id, l.debito, l.credito, a.creado_en
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
      left join public.centros_costo cc on cc.id = l.centro_costo_id
     where l.cuenta_id = p_cuenta_id
       and (p_desde is null or a.fecha >= p_desde)
       and (p_hasta is null or a.fecha <= p_hasta)
       -- Sin ocultar anulados: cuentan confirmado + anulado (netean con su
       -- reversión). Ocultándolos: solo lo vigente (confirmado, no reversión).
       and (
         (not p_excluir_anulados and a.estado in ('confirmado', 'anulado'))
         or (p_excluir_anulados and a.estado = 'confirmado' and a.tipo <> 'reversion')
       )
       and (
         not p_excluir_prorrateo
         or (
           a.tipo <> 'prorrateo'
           and not (
             a.tipo = 'reversion'
             and exists (
               select 1
                 from public.asientos_anulaciones an
                 join public.asientos ao on ao.id = an.asiento_id
                where an.asiento_reversion_id = a.id and ao.tipo = 'prorrateo'
             )
           )
         )
       )
  ),
  nat as (select naturaleza from public.cuentas where id = p_cuenta_id)
  select m.fecha, m.asiento_id, m.asiento_tipo, m.asiento_numero, m.asiento_estado, m.glosa, m.centro_codigo,
         m.origen_tipo, m.origen_id, m.debito, m.credito,
         sum(case when (select naturaleza from nat) = 'deudora'
                  then m.debito - m.credito
                  else m.credito - m.debito end)
           over (order by m.fecha, m.creado_en
                 rows between unbounded preceding and current row)::numeric(18,2) as saldo
    from movimientos m
   order by m.fecha, m.creado_en;
$$;
grant execute on function public.app_mayor_cuenta(uuid, date, date, boolean, boolean) to authenticated;

do $$ begin raise notice 'app_mayor_cuenta: p_excluir_anulados agregado.'; end $$;
