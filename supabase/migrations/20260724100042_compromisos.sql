-- =============================================================================
-- Compromisos (lo que se debe) a una fecha: saldo de las cuentas de PASIVO
-- (2x), agrupado por categoría. Junto con fn_saldo_caja permite responder
-- "¿cuánto me queda de verdad?" = caja+banco − lo que debo. Un banco lleno no
-- significa plata libre si las compras del mes están sin pagar en CxP.
-- Pasivo es acreedor: saldo = credito − debito.
-- =============================================================================

create or replace function public.fn_compromisos(p_fecha date)
returns table (categoria text, cuenta_codigo text, cuenta_nombre text, saldo numeric)
language sql stable as $$
  select
    case
      when c.codigo like '21-10-01%' or c.codigo like '21-10-02%' then 'Proveedores (por pagar)'
      when c.codigo like '21-10-15%' then 'IVA / impuestos por pagar'
      when c.codigo like '21-40%' or c.codigo like '21-45%' then 'Impuesto de renta'
      when c.codigo like '21-20%' or c.codigo like '21-25%' then 'Planilla / cargas sociales'
      when c.codigo like '22%' or c.codigo like '23%' or c.codigo like '24%' or c.codigo like '25%'
        then 'Préstamos / financiamiento'
      else 'Otros por pagar'
    end as categoria,
    c.codigo, c.nombre,
    sum(l.credito - l.debito)::numeric(18,2) as saldo
  from public.asientos_lineas l
  join public.asientos a on a.id = l.asiento_id
  join public.cuentas c on c.id = l.cuenta_id
  where a.estado in ('confirmado', 'anulado')
    and a.fecha <= p_fecha
    and c.codigo like '2%'
    and c.acepta_movimiento
  group by c.codigo, c.nombre
  having sum(l.credito - l.debito) <> 0
  order by c.codigo;
$$;
grant execute on function public.fn_compromisos(date) to authenticated;

do $$ begin raise notice 'fn_compromisos lista.'; end $$;
