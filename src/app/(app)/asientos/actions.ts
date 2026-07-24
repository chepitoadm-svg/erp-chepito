"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { asientoSchema, anularSchema } from "@/lib/validation/asientos";
import type { AsientoLineaInput } from "@/types/database";

export interface FormState {
  error?: string;
}

// Las líneas viajan como JSON en un campo oculto (el formulario es dinámico).
function parseFormData(formData: FormData) {
  let lineas: unknown = [];
  try {
    lineas = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    lineas = [];
  }
  return {
    id: (formData.get("id") as string) || undefined,
    tipo: formData.get("tipo"),
    fecha: formData.get("fecha"),
    glosa: formData.get("glosa"),
    lineas,
    confirmar: formData.get("confirmar") === "true",
  };
}

// Deja solo los campos que la base espera, y descarta líneas vacías.
function toLineasInput(
  lineas: { cuenta_id: string; centro_costo_id?: string | null; debito: number; credito: number; detalle?: string }[],
): AsientoLineaInput[] {
  return lineas.map((l) => ({
    cuenta_id: l.cuenta_id,
    centro_costo_id: l.centro_costo_id || null,
    debito: l.debito || 0,
    credito: l.credito || 0,
    monto_original: (l.debito || 0) + (l.credito || 0),
    detalle: l.detalle || null,
  }));
}

export async function crearAsiento(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("asientos.crear");
  const parsed = asientoSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }
  if (parsed.data.confirmar) await requerirPermiso("asientos.confirmar");

  const supabase = await createClient();
  const { error } = await supabase.rpc("app_crear_asiento", {
    p_tipo: parsed.data.tipo,
    p_fecha: parsed.data.fecha,
    p_glosa: parsed.data.glosa,
    p_lineas: toLineasInput(parsed.data.lineas),
    p_confirmar: parsed.data.confirmar,
  });
  if (error) return { error: traducir(error.message) };

  revalidatePath("/asientos");
  redirect("/asientos");
}

export async function editarAsiento(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("asientos.crear");
  const parsed = asientoSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }
  if (!parsed.data.id) return { error: "Falta el identificador del asiento." };
  if (parsed.data.confirmar) await requerirPermiso("asientos.confirmar");

  const supabase = await createClient();
  const { error } = await supabase.rpc("app_actualizar_asiento", {
    p_id: parsed.data.id,
    p_tipo: parsed.data.tipo,
    p_fecha: parsed.data.fecha,
    p_glosa: parsed.data.glosa,
    p_lineas: toLineasInput(parsed.data.lineas),
    p_confirmar: parsed.data.confirmar,
  });
  if (error) return { error: traducir(error.message) };

  revalidatePath("/asientos");
  redirect("/asientos");
}

// Confirmar / descartar desde el detalle (form directo, sin useActionState).
export async function confirmarAsiento(formData: FormData): Promise<void> {
  await requerirPermiso("asientos.confirmar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("asientos").update({ estado: "confirmado" }).eq("id", id);
  if (error) throw new Error(traducir(error.message));
  revalidatePath("/asientos");
  revalidatePath(`/asientos/${id}`);
}

export async function descartarAsiento(formData: FormData): Promise<void> {
  await requerirPermiso("asientos.crear");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("asientos").update({ estado: "descartado" }).eq("id", id);
  if (error) throw new Error(traducir(error.message));
  revalidatePath("/asientos");
  redirect("/asientos");
}

export async function anularAsiento(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("asientos.anular");
  const parsed = anularSchema.safeParse({
    id: formData.get("id"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_asiento", {
    p_asiento_id: parsed.data.id,
    p_motivo: parsed.data.motivo,
  });
  if (error) return { error: traducir(error.message) };

  revalidatePath("/asientos");
  revalidatePath(`/asientos/${parsed.data.id}`);
  return {};
}

// Los mensajes de la base ya vienen en español y son claros; se pasan tal cual,
// quitando el prefijo técnico de Postgres si aparece.
function traducir(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}
