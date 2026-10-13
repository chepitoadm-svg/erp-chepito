"use server";

import { requerirPermiso } from "@/lib/auth/permisos";
import { flujoCentroDetalle, type FlujoCentroDetalleFila } from "@/lib/data/reportes";

// Detalle de una línea del flujo por panadería (drill-down al tocar la línea).
export async function obtenerDetalleFlujoCentro(
  desde: string,
  hasta: string,
  centroCodigo: string,
  cuentaCodigo: string,
): Promise<FlujoCentroDetalleFila[]> {
  await requerirPermiso("reportes.financieros.ver");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return [];
  return flujoCentroDetalle(desde, hasta, centroCodigo, cuentaCodigo);
}
