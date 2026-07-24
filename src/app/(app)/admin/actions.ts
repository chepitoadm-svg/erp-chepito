"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// === PERIODOS ===============================================================
export async function cerrarPeriodo(formData: FormData): Promise<void> {
  await requerirPermiso("periodos.cerrar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cerrar_periodo", { p_periodo_id: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/admin/periodos");
}

export async function reabrirPeriodo(formData: FormData): Promise<void> {
  await requerirPermiso("periodos.reabrir");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reabrir_periodo", { p_periodo_id: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/admin/periodos");
}

// === PRORRATEO ==============================================================
export async function guardarBases(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("prorrateo.gestionar");
  const periodo = String(formData.get("periodo") ?? "");
  const origen = String(formData.get("origen") ?? "");
  let bases: { centro_destino_id: string; porcentaje: number }[] = [];
  try {
    bases = JSON.parse(String(formData.get("bases") ?? "[]"));
  } catch {
    return { error: "Bases inválidas." };
  }
  bases = bases.filter((b) => b.centro_destino_id && b.porcentaje > 0);

  const supabase = await createClient();
  const { error } = await supabase.rpc("app_guardar_bases_prorrateo", {
    p_periodo: periodo,
    p_origen: origen,
    p_bases: bases,
  });
  if (error) return { error: limpiar(error.message) };

  revalidatePath("/admin/prorrateo");
  return { ok: "Bases guardadas." };
}

export async function generarProrrateo(formData: FormData): Promise<void> {
  await requerirPermiso("prorrateo.gestionar");
  const periodo = String(formData.get("periodo") ?? "");
  const origen = String(formData.get("origen") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_generar_prorrateo", {
    p_periodo_id: periodo,
    p_centro_origen_id: origen,
  });
  if (error) throw new Error(limpiar(error.message));
  // El asiento nace en borrador; se lleva al usuario a revisarlo.
  redirect(`/asientos/${data}`);
}

// === CENTROS DE COSTO =======================================================
export async function crearCentro(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("centros.gestionar");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const requiere = formData.get("requiere_prorrateo") === "on";

  if (codigo.length < 2 || codigo.length > 8) return { error: "El código debe tener 2 a 8 caracteres." };
  if (nombre.length < 2) return { error: "El nombre es obligatorio." };
  if (tipo !== "final" && tipo !== "intermedio") return { error: "Tipo inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("centros_costo").insert({
    codigo,
    nombre,
    tipo,
    requiere_prorrateo: tipo === "intermedio" ? requiere : false,
  });
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe un centro con ese código."
        : limpiar(error.message),
    };
  }
  revalidatePath("/admin/centros");
  return { ok: "Centro creado." };
}

export async function alternarCentroActivo(formData: FormData): Promise<void> {
  await requerirPermiso("centros.gestionar");
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("centros_costo").update({ activo: !activo }).eq("id", id);
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/admin/centros");
}
