-- =============================================================================
-- Ampliar fn_cambiar_centro_factura a las facturas de INVENTARIO.
--
-- La compra de inventario debita el activo Inventario (cuenta de balance, sin
-- centro), así que el asiento de la compra no lleva centro. Pero la factura sí
-- guarda un centro de costo, y el módulo de COSTEO lo usa para atribuir la
-- compra a cada centro por período (compras = costo del período por centro).
-- Por eso el usuario necesita corregir ese centro también en las de inventario.
--
-- Para inventario, cambiar el centro es solo actualizar facturas_compra: no hay
-- ninguna línea de asiento con centro que tocar (el UPDATE sobre asientos_lineas
-- afecta 0 filas). Para gasto, sigue reetiquetando la línea de resultado.
-- =============================================================================

create or replace function public.fn_cambiar_centro_factura(
  p_factura uuid,
  p_centro  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo    text;
  v_asiento uuid;
  v_activo  boolean;
begin
  select tipo, asiento_id into v_tipo, v_asiento
    from public.facturas_compra where id = p_factura;
  if not found then
    raise exception 'Factura inexistente.';
  end if;

  select activo into v_activo from public.centros_costo where id = p_centro;
  if not coalesce(v_activo, false) then
    raise exception 'El centro de costo no existe o está inactivo.';
  end if;

  update public.facturas_compra
     set centro_costo_id = p_centro
   where id = p_factura;

  -- Solo las facturas de gasto tienen líneas de resultado con centro; en las de
  -- inventario esto no afecta ninguna fila (todo es balance).
  if v_asiento is not null then
    update public.asientos_lineas
       set centro_costo_id = p_centro
     where asiento_id = v_asiento
       and centro_costo_id is not null;
  end if;
end;
$$;

do $$ begin raise notice 'fn_cambiar_centro_factura ahora cubre inventario y gasto.'; end $$;
