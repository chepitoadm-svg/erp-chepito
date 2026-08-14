"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearVentaDiaSchema } from "@/lib/validation/ventas";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Convierte texto de monto (permite coma o punto decimal) a número.
function num(raw: FormDataEntryValue | null): number {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function crearVentaDia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("ventas.registrar");

  const glosa = String(formData.get("glosa") ?? "").trim();
  const parsed = crearVentaDiaSchema.safeParse({
    centro_costo_id: String(formData.get("centro_costo_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    gravado: num(formData.get("gravado")),
    exento: num(formData.get("exento")),
    iva: num(formData.get("iva")),
    glosa: glosa || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_venta_dia", {
    p_centro: parsed.data.centro_costo_id,
    p_fecha: parsed.data.fecha,
    p_gravado: parsed.data.gravado,
    p_exento: parsed.data.exento,
    p_iva: parsed.data.iva,
    p_glosa: parsed.data.glosa ?? null,
  });
  if (error || !id) {
    const msg = error?.message ?? "No se pudo registrar la venta.";
    return {
      error: msg.includes("ventas_dia_unica")
        ? "Ya hay una venta para ese negocio en esa fecha."
        : limpiar(msg),
    };
  }
  redirect(`/ventas/${id}`);
}

export async function confirmarVentaDia(formData: FormData): Promise<void> {
  await requerirPermiso("ventas.registrar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_venta_dia", { p_venta: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/ventas/${id}`);
  revalidatePath("/ventas");
}

export async function anularVentaDia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("ventas.registrar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_venta_dia", {
    p_venta: id,
    p_motivo: motivo,
  });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/ventas/${id}`);
  revalidatePath("/ventas");
  return { ok: "Venta anulada." };
}
