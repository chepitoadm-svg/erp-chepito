-- =============================================================================
-- Fase 4-1 · Editor: guardar una receta/producto con sus líneas de forma ATÓMICA.
--
-- Recibe un JSON con la cabecera y el arreglo de líneas; crea (si id es null) o
-- actualiza la receta, borra sus líneas y las vuelve a insertar — todo en una
-- sola llamada (una función = una transacción). Devuelve el id de la receta.
--
-- SECURITY INVOKER (por defecto): corre con los permisos del que llama, así que
-- la RLS de recetas/recetas_lineas exige `produccion.gestionar`. Las CHECK de
-- las tablas validan unidades, cantidades y la coherencia tipo_ref ↔ referencia.
-- =============================================================================
create or replace function public.fn_guardar_receta(p jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id   uuid;
  v_line jsonb;
  v_n    int := 0;
begin
  v_id := nullif(p->>'id', '')::uuid;

  if v_id is null then
    insert into public.recetas
      (nombre, es_producto, clasificacion, rinde_cantidad, rinde_unidad, precio_venta, articulo_id)
    values
      (nullif(p->>'nombre',''), coalesce((p->>'es_producto')::boolean, false),
       nullif(p->>'clasificacion',''), nullif(p->>'rinde_cantidad','')::numeric,
       nullif(p->>'rinde_unidad',''), nullif(p->>'precio_venta','')::numeric,
       nullif(p->>'articulo_id','')::uuid)
    returning id into v_id;
  else
    update public.recetas set
      nombre         = nullif(p->>'nombre',''),
      es_producto    = coalesce((p->>'es_producto')::boolean, false),
      clasificacion  = nullif(p->>'clasificacion',''),
      rinde_cantidad = nullif(p->>'rinde_cantidad','')::numeric,
      rinde_unidad   = nullif(p->>'rinde_unidad',''),
      precio_venta   = nullif(p->>'precio_venta','')::numeric,
      articulo_id    = nullif(p->>'articulo_id','')::uuid
    where id = v_id;
    if not found then
      raise exception 'Receta no encontrada: %', v_id;
    end if;
    delete from public.recetas_lineas where receta_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p->'lineas', '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into public.recetas_lineas
      (receta_id, linea, tipo_ref, articulo_id, insumo_manual_id, receta_ref_id, cantidad, unidad)
    values
      (v_id, v_n, v_line->>'tipo_ref',
       nullif(v_line->>'articulo_id','')::uuid,
       nullif(v_line->>'insumo_manual_id','')::uuid,
       nullif(v_line->>'receta_ref_id','')::uuid,
       (v_line->>'cantidad')::numeric,
       v_line->>'unidad');
  end loop;

  return v_id;
end $$;

grant execute on function public.fn_guardar_receta(jsonb) to authenticated;
