"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearVentaDiaSchema } from "@/lib/validation/ventas";
import { resumenVentasQupos, type DiaVentaQupos } from "@/lib/xlsx/qupos";

export interface FormState {
  error?: string;
  ok?: string;
}

export interface AnalisisQuposState {
  error?: string;
  centro_costo_id?: string;
  dias?: DiaVentaQupos[];
  ignoradas_sin_fecha?: number;
  ignorado_total?: number;
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

// Lee el Excel de QuPOS y devuelve el resumen por día (sin guardar nada).
export async function analizarQupos(
  _prev: AnalisisQuposState,
  formData: FormData,
): Promise<AnalisisQuposState> {
  await requerirPermiso("ventas.registrar");
  const centro = String(formData.get("centro_costo_id") ?? "");
  if (!centro) return { error: "Elegí el negocio." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Subí el Excel de QuPOS." };
  }
  let resumen;
  try {
    const buf = new Uint8Array(await archivo.arrayBuffer());
    resumen = resumenVentasQupos(buf);
  } catch {
    return { error: "No se pudo leer el Excel. ¿Es el export de ventas de QuPOS?" };
  }
  if (!resumen.dias.length) {
    return { error: "El Excel no trae ventas con fecha." };
  }
  return {
    centro_costo_id: centro,
    dias: resumen.dias,
    ignoradas_sin_fecha: resumen.ignoradas_sin_fecha,
    ignorado_total: resumen.ignorado_total,
  };
}

// Registra la venta de un día ya calculada por el importador (reusa el mismo
// posteo que la carga manual).
export async function registrarVentaImportada(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("ventas.registrar");
  const parsed = crearVentaDiaSchema.safeParse({
    centro_costo_id: String(formData.get("centro_costo_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    gravado: num(formData.get("gravado")),
    exento: num(formData.get("exento")),
    iva: num(formData.get("iva")),
    glosa: String(formData.get("glosa") ?? "").trim() || null,
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
