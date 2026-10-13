-- =============================================================================
-- Reparto del prorrateo del periodo, para "cargar" el flujo de caja por panadería
-- con su parte de los centros de apoyo (Taller, General).
--
-- Devuelve, tal como quedó en los asientos de prorrateo (tipo='prorrateo',
-- confirmados) del rango, cuánto gasto se movió de cada centro de apoyo (origen)
-- hacia cada canal (destino). Con esos montos la app saca el % efectivo del mes y
-- reparte el FLUJO DE CAJA neto del centro de apoyo entre las sucursales con esa
-- misma proporción. Taller usa el % del centro; General, su mezcla por cuenta.
--
-- Un asiento de prorrateo tiene un único centro "vaciado" (recibe crédito neto =
-- neto_debito < 0) y uno o varios canales que reciben el gasto (neto_debito > 0).
-- =============================================================================

create or replace function public.fn_prorrateo_reparto(p_desde date, p_hasta date)
returns table(
  origen_codigo text, origen_nombre text,
  destino_codigo text, destino_nombre text, monto numeric
)
language sql stable as $function$
  with lineas as (
    select a.id as asiento_id, l.centro_costo_id,
           sum(l.debito - l.credito) as neto_debito
      from public.asientos a
      join public.asientos_lineas l on l.asiento_id = a.id
     where a.tipo = 'prorrateo' and a.estado = 'confirmado'
       and a.fecha between p_desde and p_hasta
     group by a.id, l.centro_costo_id
     having sum(l.debito - l.credito) <> 0
  ),
  origen as (  -- centro de apoyo vaciado por asiento (crédito neto)
    select asiento_id, centro_costo_id as origen_id
      from lineas where neto_debito < 0
  ),
  destino as (  -- canales que reciben el gasto
    select asiento_id, centro_costo_id as destino_id, neto_debito as monto
      from lineas where neto_debito > 0
  )
  select co.codigo, co.nombre, cd.codigo, cd.nombre,
         sum(d.monto)::numeric(18,2) as monto
    from destino d
    join origen o on o.asiento_id = d.asiento_id
    join public.centros_costo co on co.id = o.origen_id
    join public.centros_costo cd on cd.id = d.destino_id
   group by co.codigo, co.nombre, cd.codigo, cd.nombre;
$function$;

grant execute on function public.fn_prorrateo_reparto(date, date) to authenticated;

do $$ begin raise notice 'fn_prorrateo_reparto creada.'; end $$;
