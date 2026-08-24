-- =============================================================================
-- Flujo de caja (método DIRECTO, sacado de los libros). Toda la plata entra y
-- sale por las cuentas de caja/banco (11-10-10 y 11-10-15). Se toman los
-- asientos que tocan esas cuentas y se clasifica la CONTRAPARTIDA (para qué fue
-- la plata). Así el flujo SIEMPRE cuadra con el saldo real de caja+banco.
--
-- Regla exacta: para cada línea de contrapartida (no-caja) de un asiento que
-- toca caja, su aporte al flujo = credito - debito. Positivo = entró plata
-- (ej. Haber Ventas), negativo = salió (ej. Debe Gasto / Debe CxP). Las
-- transferencias entre cuentas propias (banco->caja) no tienen contrapartida
-- fuera de caja, así que aportan 0: quedan excluidas solas.
-- =============================================================================

-- Saldo total de caja+banco a una fecha (son cuentas deudoras: debito - credito).
create or replace function public.fn_saldo_caja(p_fecha date)
returns numeric
language sql stable as $$
  select coalesce(sum(l.debito - l.credito), 0)::numeric(18,2)
    from public.asientos_lineas l
    join public.asientos a on a.id = l.asiento_id
    join public.cuentas c on c.id = l.cuenta_id
   where a.estado in ('confirmado', 'anulado')
     and a.fecha <= p_fecha
     and (c.codigo like '11-10-10%' or c.codigo like '11-10-15%');
$$;
grant execute on function public.fn_saldo_caja(date) to authenticated;

-- Flujo por cuenta de contrapartida, con su categoría automática.
create or replace function public.fn_flujo_caja(p_desde date, p_hasta date)
returns table (categoria text, tipo text, cuenta_codigo text, cuenta_nombre text, monto numeric)
language sql stable as $$
  with cash as (
    select id from public.cuentas
     where (codigo like '11-10-10%' or codigo like '11-10-15%')
  ),
  cash_asientos as (
    select distinct a.id
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
     where a.estado in ('confirmado', 'anulado')
       and a.fecha between p_desde and p_hasta
       and l.cuenta_id in (select id from cash)
  )
  select
    case
      when c.codigo like '41%' then 'Ventas cobradas'
      when c.codigo like '11-20%' then 'Cobros a clientes (CxC)'
      when c.codigo like '21-10-15%' then 'IVA / impuestos'
      when c.codigo like '21-10-01%' or c.codigo like '21-10-02%' then 'Pago a proveedores'
      when c.codigo like '51%' then 'Compras / mercadería'
      when c.codigo like '61-10-01%' then 'Planilla / salarios'
      when c.codigo like '61-10-14%' then 'Servicios (agua, luz, tel.)'
      when c.codigo like '61-10-28%' then 'Alquileres'
      when c.codigo like '61-10-31%' then 'Combustible'
      when c.codigo like '61%' then 'Gastos operativos'
      when c.codigo like '62%' then 'Gastos financieros'
      when c.codigo like '63%' or c.codigo like '64%' then 'Otros gastos'
      when c.codigo like '31%' then 'Capital / retiros'
      when c.codigo like '24%' or c.codigo like '25%' then 'Préstamos / financiamiento'
      when c.codigo like '42%' or c.codigo like '43%' or c.codigo like '52%' then 'Otros ingresos'
      else 'Otros movimientos'
    end as categoria,
    case when sum(l.credito - l.debito) >= 0 then 'entrada' else 'salida' end as tipo,
    c.codigo, c.nombre,
    sum(l.credito - l.debito)::numeric(18,2) as monto
  from public.asientos_lineas l
  join public.cuentas c on c.id = l.cuenta_id
  where l.asiento_id in (select id from cash_asientos)
    and l.cuenta_id not in (select id from cash)
  group by c.codigo, c.nombre
  having sum(l.credito - l.debito) <> 0
  order by c.codigo;
$$;
grant execute on function public.fn_flujo_caja(date, date) to authenticated;

do $$ begin raise notice 'fn_flujo_caja y fn_saldo_caja listas.'; end $$;
