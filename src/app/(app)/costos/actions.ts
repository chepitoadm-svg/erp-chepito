"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { calcularCostoProduccionMes, type CostoCentro } from "@/lib/data/costoProduccion";

export interface FormState {
  error?: string;
  ok?: string;
}

export interface CalculoState {
  error?: string;
  periodo?: string;
  centros?: CostoCentro[];
  total?: number;
  sin_mapear?: { sucursal: string; monto: number }[];
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Lee la producción del mes y devuelve el costo por centro (sin guardar nada).
export async function calcularCostoMes(_prev: CalculoState, formData: FormData): Promise<CalculoState> {
  await requerirPermiso("costos.registrar");
  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { error: "Elegí el mes." };
  let calc;
  try {
    calc = await calcularCostoProduccionMes(periodo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo calcular el costo." };
  }
  if (!calc.centros.length) return { error: "No hay producción costeable en ese mes." };
  return { periodo, centros: calc.centros, total: calc.total, sin_mapear: calc.sin_mapear };
}

// Guarda el costo del mes ya calculado (borrador). El asiento se postea al confirmar.
export async function registrarCostoMes(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("costos.registrar");
  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { error: "Mes inválido." };
  let lineas: { centro_costo_id: string; monto: number; sin_receta: number }[];
  try {
    lineas = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudo leer el detalle." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "No hay montos para registrar." };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_costo_mes", {
    p_periodo: `${periodo}-01`,
    p_lineas: lineas,
  });
  if (error || !id) {
    const msg = error?.message ?? "No se pudo registrar el costo.";
    return {
      error: msg.includes("costo_produccion_mes_unico")
        ? "Ya hay un costo registrado para ese mes."
        : limpiar(msg),
    };
  }
  redirect(`/costos/${id}`);
}

export async function confirmarCostoMes(formData: FormData): Promise<void> {
  await requerirPermiso("costos.registrar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_costo_mes", { p_mes: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/costos/${id}`);
  revalidatePath("/costos");
}

export async function anularCostoMes(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("costos.registrar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_costo_mes", { p_mes: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/costos/${id}`);
  revalidatePath("/costos");
  return { ok: "Costo anulado." };
}
