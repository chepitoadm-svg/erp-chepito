-- =============================================================================
-- Compras — La clave del comprobante es única solo entre facturas NO anuladas.
--
-- Antes: UNIQUE(clave) plano. Problema: al anular una factura, su clave queda
-- ocupada para siempre, así que "anular y volver a emitir" el mismo comprobante
-- (flujo normal de corrección) chocaba con duplicate key. Ahora la unicidad
-- aplica solo a las facturas vigentes (estado <> 'anulada'), permitiendo
-- re-emitir con la misma clave fiscal tras anular. Sigue impidiendo dos
-- facturas vivas con la misma clave (idempotencia del XML intacta).
-- =============================================================================

alter table public.facturas_compra drop constraint if exists facturas_compra_clave_key;

create unique index if not exists facturas_compra_clave_activa
  on public.facturas_compra (clave)
  where clave is not null and estado <> 'anulada';
