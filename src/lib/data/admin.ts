// Capa de datos de ADMINISTRACIÓN contable (periodos, prorrateo, centros).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PeriodoRow {
  id: string;
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "abierto" | "cerrado" | "bloqueado";
  n_borradores: number;
  pools_sin_bases: string | null;
}

export async function listarPeriodos(anio?: number): Promise<PeriodoRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_periodos", {
    p_anio: anio ?? null,
  });
  if (error) throw new Error(`No se pudieron cargar los periodos: ${error.message}`);
  return (data ?? []) as PeriodoRow[];
}

export interface ProrrateoCentro {
  centro_id: string;
  codigo: string;
  nombre: string;
  requiere_prorrateo: boolean;
  pool: number;
  suma_bases: number;
  bases: { centro_destino_id: string; destino_codigo: string; porcentaje: number }[];
}

export async function estadoProrrateo(periodoId: string): Promise<ProrrateoCentro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_estado_prorrateo", {
    p_periodo: periodoId,
  });
  if (error) throw new Error(`No se pudo cargar el prorrateo: ${error.message}`);
  return (data ?? []) as ProrrateoCentro[];
}

export async function listarCentrosCostoAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centros_costo")
    .select("id, codigo, nombre, tipo, activo, requiere_prorrateo")
    .order("tipo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los centros: ${error.message}`);
  return data ?? [];
}

/** Centros finales activos, para el selector de destinos del prorrateo. */
export async function listarCentrosFinales() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centros_costo")
    .select("id, codigo, nombre")
    .eq("activo", true)
    .eq("tipo", "final")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los centros: ${error.message}`);
  return data ?? [];
}
