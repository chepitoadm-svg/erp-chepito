-- =============================================================================
-- fn_compromisos_centro v2: ahora separa cada pendiente en VENCIDO vs POR VENCER
-- según la fecha de vencimiento de la CxP, para que en el simulador se pueda
-- elegir qué meter en el flujo (no todo lo pendiente vence en el mismo mes).
--   vencido = fecha_vencimiento NULL (sin fecha → se asume debido) o <= p_fecha.
-- =============================================================================

drop function if exists public.fn_compromisos_centro(date);

create function public.fn_compromisos_centro(p_fecha date)
returns table(
  centro_codigo text, centro_nombre text,
  categoria text, cuenta_codigo text, cuenta_nombre text,
  vencido boolean, saldo numeric
)
language sql stable as $function$
  with base as (
    select coalesce(fc.centro_costo_id, g.centro_costo_id) as centro_id,
           case when cxp.gasto_id is not null then coalesce(gcu.codigo, '61') else '21-10-01' end as codigo,
           case when cxp.gasto_id is not null then coalesce(gcu.nombre, 'Gasto') else 'Proveedores (facturas)' end as nombre,
           (cxp.fecha_vencimiento is null or cxp.fecha_vencimiento <= p_fecha) as vencido,
           cxp.saldo
      from public.cuentas_por_pagar cxp
      left join public.facturas_compra fc on fc.id = cxp.factura_id
      left join public.gastos g on g.id = cxp.gasto_id
      left join public.cuentas gcu on gcu.id = g.cuenta_gasto_id
     where cxp.estado <> 'anulada' and cxp.saldo > 0 and cxp.fecha <= p_fecha
  )
  select
    coalesce(cc.codigo, 'SINNEG') as centro_codigo,
    coalesce(cc.nombre, 'Sin negocio (sin panadería)') as centro_nombre,
    case
      when b.codigo like '61-10-28%' then 'Alquileres'
      when b.codigo like '61-10-14%' then 'Servicios (agua, luz, tel.)'
      when b.codigo like '61-10-01%' then 'Planilla / salarios'
      when b.codigo like '61-10-31%' then 'Combustible'
      when b.codigo like '21-10-01%' or b.codigo like '51%' then 'Proveedores (mercadería)'
      when b.codigo like '62%' then 'Gastos financieros'
      when b.codigo like '63%' or b.codigo like '64%' then 'Otros gastos'
      when b.codigo like '61%' then 'Gastos operativos'
      else 'Otros'
    end as categoria,
    b.codigo as cuenta_codigo, b.nombre as cuenta_nombre,
    b.vencido,
    sum(b.saldo)::numeric(18,2) as saldo
  from base b
  left join public.centros_costo cc on cc.id = b.centro_id
  group by cc.codigo, cc.nombre, 3, b.codigo, b.nombre, b.vencido
  having sum(b.saldo) <> 0
  order by cc.codigo, sum(b.saldo) desc;
$function$;

grant execute on function public.fn_compromisos_centro(date) to authenticated;

do $$ begin raise notice 'fn_compromisos_centro v2 (vencido/por vencer) creada.'; end $$;
