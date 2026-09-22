-- =============================================================================
-- Fix: cambiar el centro de una factura debe reetiquetar TODOS los asientos
-- ligados a ella, no solo el de la compra.
--
-- Las compras del perpetuo reclasificadas (migr. 100104) tienen DOS asientos: el
-- de la compra (origen 'factura_compra', a Inventario, sin centro) y el de
-- reclasificación (origen 'reclasif_compra_inv', a Compras 51-10 CON centro). La
-- versión anterior de fn_cambiar_centro_factura solo tocaba facturas_compra.asiento_id
-- (el de la compra), así que el asiento de reclasificación —el que de verdad
-- aparece en el Estado de Resultados por centro— NO se actualizaba: el auxiliar
-- (la factura) mostraba un centro y la conta otro.
--
-- Ahora reetiqueta el centro en las líneas de resultado de TODOS los asientos no
-- anulados cuyo origen es la factura (compra y/o reclasificación). Importes y
-- cuentas intactos.
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
  v_activo boolean;
begin
  if not exists (select 1 from public.facturas_compra where id = p_factura) then
    raise exception 'Factura inexistente.';
  end if;
  select activo into v_activo from public.centros_costo where id = p_centro;
  if not coalesce(v_activo, false) then
    raise exception 'El centro de costo no existe o está inactivo.';
  end if;

  update public.facturas_compra
     set centro_costo_id = p_centro
   where id = p_factura;

  -- Reetiqueta el centro en las líneas de resultado (centro no nulo) de todos los
  -- asientos ligados a la factura: la compra (periódico) y/o la reclasificación
  -- (perpetuo). No cambia importes ni cuentas.
  update public.asientos_lineas al
     set centro_costo_id = p_centro
    from public.asientos a
   where a.id = al.asiento_id
     and a.origen_id = p_factura
     and a.origen_tipo in ('factura_compra', 'reclasif_compra_inv')
     and a.estado <> 'anulado'
     and al.centro_costo_id is not null;
end $$;

revoke all on function public.fn_cambiar_centro_factura(uuid, uuid) from public, anon;
grant execute on function public.fn_cambiar_centro_factura(uuid, uuid) to authenticated;

do $$ begin raise notice 'fn_cambiar_centro_factura reetiqueta compra + reclasificación.'; end $$;
