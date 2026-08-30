-- =============================================================================
-- Reporte de CUADRE: por cada cuenta que usa el módulo de Gastos, compara lo del
-- auxiliar (suma de los gastos registrados, a la cuenta = subtotal) contra el
-- Mayor (movimiento neto de esa cuenta en la contabilidad). La diferencia = plata
-- que llegó a la cuenta por fuera del módulo (asiento directo, etc.). El prorrateo
-- netea a cero por cuenta (redistribuye entre centros), así que no falsea el cuadre.
-- =============================================================================

create or replace function public.fn_cuadre_gastos(p_desde date, p_hasta date)
returns table (
  cuenta_codigo text,
  cuenta_nombre text,
  cuenta_id     uuid,
  auxiliar      numeric(18,2),
  mayor         numeric(18,2),
  diferencia    numeric(18,2)
)
language sql stable security definer set search_path = public as $$
  with ctas as (
    select distinct cuenta_gasto_id as cid from public.gastos
  ),
  aux as (
    select cuenta_gasto_id cid, coalesce(sum(subtotal), 0) t
    from public.gastos
    where estado = 'confirmado' and fecha between p_desde and p_hasta
    group by cuenta_gasto_id
  ),
  may as (
    select l.cuenta_id cid, coalesce(sum(l.debito - l.credito), 0) t
    from public.asientos_lineas l
    join public.asientos a on a.id = l.asiento_id
    where a.estado = 'confirmado' and a.tipo <> 'reversion'
      and a.fecha between p_desde and p_hasta
      and l.cuenta_id in (select cid from ctas)
    group by l.cuenta_id
  )
  select
    c.codigo, c.nombre, c.id,
    coalesce(aux.t, 0)::numeric(18,2),
    coalesce(may.t, 0)::numeric(18,2),
    (coalesce(may.t, 0) - coalesce(aux.t, 0))::numeric(18,2)
  from ctas
  join public.cuentas c on c.id = ctas.cid
  left join aux on aux.cid = ctas.cid
  left join may on may.cid = ctas.cid
  order by abs(coalesce(may.t, 0) - coalesce(aux.t, 0)) desc, c.codigo;
$$;
grant execute on function public.fn_cuadre_gastos(date, date) to authenticated;

do $$ begin raise notice 'fn_cuadre_gastos lista.'; end $$;
