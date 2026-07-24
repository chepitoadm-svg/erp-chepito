-- =============================================================================
-- Libro Mayor por cuenta, con saldo acumulado (running balance).
-- La vista v_mayor da el detalle plano; esto lo ordena por fecha y acumula el
-- saldo corrido según la naturaleza de la cuenta, que es como se lee un mayor.
-- =============================================================================
create or replace function public.app_mayor_cuenta(
  p_cuenta_id uuid,
  p_desde     date default null,
  p_hasta     date default null
)
returns table (
  fecha           date,
  asiento_id      uuid,
  asiento_tipo    text,
  asiento_numero  int,
  glosa           text,
  centro_codigo   text,
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
           a.glosa, cc.codigo as centro_codigo,
           l.debito, l.credito, a.creado_en
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
      left join public.centros_costo cc on cc.id = l.centro_costo_id
     where l.cuenta_id = p_cuenta_id
       and a.estado = 'confirmado'
       and (p_desde is null or a.fecha >= p_desde)
       and (p_hasta is null or a.fecha <= p_hasta)
  ),
  nat as (select naturaleza from public.cuentas where id = p_cuenta_id)
  select m.fecha, m.asiento_id, m.asiento_tipo, m.asiento_numero, m.glosa, m.centro_codigo,
         m.debito, m.credito,
         sum(case when (select naturaleza from nat) = 'deudora'
                  then m.debito - m.credito
                  else m.credito - m.debito end)
           over (order by m.fecha, m.creado_en
                 rows between unbounded preceding and current row)::numeric(18,2) as saldo
    from movimientos m
   order by m.fecha, m.creado_en;
$$;

comment on function public.app_mayor_cuenta(uuid, date, date) is
  'Libro Mayor de una cuenta con saldo acumulado según su naturaleza.';

do $$
begin
  raise notice 'app_mayor_cuenta lista.';
end $$;
