// Capa de datos de ASIENTOS (lecturas). Corre en el servidor con el cliente
// sujeto a RLS. Las escrituras viven en las Server Actions.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AsientoTipo, AsientoEstado } from "@/types/database";

export interface AsientoListado {
  id: string;
  tipo: AsientoTipo;
  numero: number | null;
  fecha: string;
  glosa: string;
  estado: AsientoEstado;
  anio: number;
  mes: number;
  total: number;
  n_lineas: number;
}

export interface AsientoLineaDetalle {
  linea: number;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  centro_costo_id: string | null;
  centro_codigo: string | null;
  debito: number;
  credito: number;
  moneda: string;
  tipo_cambio: number;
  monto_original: number;
  detalle: string | null;
}

export interface AsientoDetalle {
  id: string;
  tipo: AsientoTipo;
  numero: number | null;
  fecha: string;
  glosa: string;
  estado: AsientoEstado;
  periodo_id: string;
  anio: number;
  mes: number;
  periodo_estado: "abierto" | "cerrado" | "bloqueado";
  creado_en: string;
  confirmado_en: string | null;
  anulado_en: string | null;
  lineas: AsientoLineaDetalle[];
  anulacion: { reversion_id: string; motivo: string; fecha_reversion: string } | null;
}

export async function listarAsientos(filtros?: {
  estado?: AsientoEstado;
  periodo?: string;
}): Promise<AsientoListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_asientos", {
    p_estado: filtros?.estado ?? null,
    p_periodo: filtros?.periodo ?? null,
  });
  if (error) throw new Error(`No se pudieron cargar los asientos: ${error.message}`);
  return (data ?? []) as AsientoListado[];
}

export async function obtenerAsiento(id: string): Promise<AsientoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_obtener_asiento", { p_id: id });
  if (error) throw new Error(`No se pudo cargar el asiento: ${error.message}`);
  if (!data || Object.keys(data).length === 0) return null;
  return data as unknown as AsientoDetalle;
}

/** Cuentas que aceptan movimiento, para el selector de líneas. */
export async function listarCuentasPosteables() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre, tipo, naturaleza")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas: ${error.message}`);
  return data ?? [];
}

/** Centros de costo activos, para el selector. */
export async function listarCentrosCosto() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centros_costo")
    .select("id, codigo, nombre, tipo")
    .eq("activo", true)
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los centros de costo: ${error.message}`);
  return data ?? [];
}
