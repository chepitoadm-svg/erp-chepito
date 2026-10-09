-- =============================================================================
-- Fase 4-1 · Editor: convertir un INSUMO MANUAL en un ARTÍCULO del inventario.
--
-- Reapunta todas las líneas de receta que usaban el insumo manual al artículo
-- elegido (tipo_ref 'insumo_manual' → 'articulo'), conservando cantidad y unidad,
-- y desactiva el insumo manual (anular, nunca borrar). A partir de ahí esas
-- recetas costean por el promedio ponderado real del inventario.
--
-- Atómico (una función = una transacción). SECURITY INVOKER → la RLS exige
-- `produccion.gestionar`. Devuelve cuántas líneas se reapuntaron.
-- =============================================================================
create or replace function public.fn_convertir_insumo(p_insumo uuid, p_articulo uuid)
returns int
language plpgsql
as $$
declare
  v_n int;
begin
  if p_insumo is null or p_articulo is null then
    raise exception 'Faltan datos: insumo y artículo son obligatorios.';
  end if;

  update public.recetas_lineas
     set tipo_ref = 'articulo', articulo_id = p_articulo, insumo_manual_id = null
   where insumo_manual_id = p_insumo
     and tipo_ref = 'insumo_manual';
  get diagnostics v_n = row_count;

  update public.insumos_manuales set estado = 'inactivo' where id = p_insumo;

  return v_n;
end $$;

grant execute on function public.fn_convertir_insumo(uuid, uuid) to authenticated;
