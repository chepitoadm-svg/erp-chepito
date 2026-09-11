-- =============================================================================
-- Ventas externas: el total del mes debe contar solo clientes ACTIVOS.
-- La grilla ya muestra y totaliza solo los clientes activos, pero la tarjeta
-- "Ventas" (que suma lo que devuelve este RPC) contaba TAMBIÉN los inactivos.
-- Cuando se desactiva un cliente duplicado, sus filas quedaban sumando en el
-- total → el número de arriba (todos) no calzaba con el de la grilla (activos).
-- Se filtra por cliente activo para que ambos coincidan. No se borra dato: las
-- filas de clientes inactivos quedan guardadas, solo dejan de contar.
-- =============================================================================

create or replace function public.app_ventas_ext_mes(p_anio int, p_mes int)
returns table(cliente_id uuid, dia int, monto numeric)
language sql stable security definer set search_path = public as $$
  select v.cliente_id, extract(day from v.fecha)::int, v.monto
  from public.venta_externa v
  join public.venta_ext_cliente cl on cl.id = v.cliente_id
  where (public.soy_administrador() or public.tengo_permiso('ventas.registrar'))
    and cl.activo
    and extract(year from v.fecha)::int = p_anio and extract(month from v.fecha)::int = p_mes;
$$;
grant execute on function public.app_ventas_ext_mes(int, int) to authenticated;

do $$ begin raise notice 'app_ventas_ext_mes: ahora solo clientes activos.'; end $$;
