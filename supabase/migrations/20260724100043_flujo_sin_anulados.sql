-- =============================================================================
-- Flujo de caja / compromisos: ignorar los asientos ANULADOS y sus REVERSIONES.
--
-- Un gasto editado deja el original ('anulado') + su reversión ('confirmado').
-- Ambos netean a cero en cualquier cuenta, así que NO cambian los totales del
-- flujo (verificado: idéntico al centavo), pero ensucian el detalle: la misma
-- partida aparece como anulado y como reversión. Se pasa el filtro a
-- estado='confirmado' y tipo<>'reversion' (solo lo vigente), en las tres
-- funciones del módulo, para que el drill-down muestre solo movimientos reales.
-- Como el saldo y el flujo usan el MISMO filtro, siguen cuadrando exacto.
-- =============================================================================

create or replace function public.fn_saldo_caja(p_fecha date)
returns numeric
language sql stable as $$
  select coalesce(sum(l.debito - l.credito), 0)::numeric(18,2)
    from public.asientos_lineas l
    join public.asientos a on a.id = l.asiento_id
    join public.cuentas c on c.id = l.cuenta_id
   where a.estado = 'confirmado' and a.tipo <> 'reversion'
     and a.fecha <= p_fecha
     and (c.codigo like '11-10-10%' or c.codigo like '11-10-15%');
$$;

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
     where a.estado = 'confirmado' and a.tipo <> 'reversion'
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
  where a.estado = 'confirmado' and a.tipo <> 'reversion'
    and a.fecha <= p_fecha
    and c.codigo like '2%'
    and c.acepta_movimiento
  group by c.codigo, c.nombre
  having sum(l.credito - l.debito) <> 0
  order by c.codigo;
$$;

do $$ begin raise notice 'flujo/compromisos ahora ignoran anulados y reversiones.'; end $$;
