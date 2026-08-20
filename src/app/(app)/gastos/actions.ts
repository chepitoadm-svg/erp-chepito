"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearGastoSchema } from "@/lib/validation/gastos";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

function num(raw: FormDataEntryValue | null): number {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function crearGasto(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("gastos.registrar");
  const desc = String(formData.get("descripcion") ?? "").trim();
  const porPagar = String(formData.get("modo") ?? "pagado") === "por_pagar";
  const cuentaPago = String(formData.get("cuenta_pago_id") ?? "").trim();
  const proveedor = String(formData.get("proveedor_id") ?? "").trim();
  const vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim();
  const parsed = crearGastoSchema.safeParse({
    centro_costo_id: String(formData.get("centro_costo_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    cuenta_gasto_id: String(formData.get("cuenta_gasto_id") ?? ""),
    cuenta_pago_id: porPagar ? null : cuentaPago || null,
    proveedor_id: porPagar ? proveedor || null : null,
    fecha_vencimiento: porPagar ? vencimiento || null : null,
    subtotal: num(formData.get("subtotal")),
    iva: num(formData.get("iva")),
    descripcion: desc || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_gasto", {
    p_centro: parsed.data.centro_costo_id,
    p_fecha: parsed.data.fecha,
    p_cuenta_gasto: parsed.data.cuenta_gasto_id,
    p_cuenta_pago: parsed.data.cuenta_pago_id ?? null,
    p_subtotal: parsed.data.subtotal,
    p_iva: parsed.data.iva,
    p_descripcion: parsed.data.descripcion ?? null,
    p_proveedor: parsed.data.proveedor_id ?? null,
    p_vencimiento: parsed.data.fecha_vencimiento ?? null,
  });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo registrar el gasto.") };
  redirect(`/gastos/${id}`);
}

// Crea un proveedor rápido (solo nombre + cédula) desde el formulario de gasto,
// para no tener que salir a Compras → Proveedores. Devuelve el id para
// seleccionarlo de una.
export async function crearProveedorRapido(
  nombre: string,
  cedula: string,
): Promise<{ ok: true; id: string; nombre: string } | { ok: false; error: string }> {
  try {
    await requerirPermiso("proveedores.gestionar");
  } catch {
    return { ok: false, error: "No tenés permiso para crear proveedores." };
  }
  const n = nombre.trim();
  const c = cedula.replace(/\D/g, "");
  if (n.length < 2) return { ok: false, error: "El nombre es obligatorio." };
  if (c.length < 9 || c.length > 12) return { ok: false, error: "Cédula jurídica inválida (9–12 dígitos)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .insert({ nombre: n, cedula_juridica: c })
    .select("id, nombre")
    .single();
  if (error || !data) {
    const msg = error?.message ?? "No se pudo crear el proveedor.";
    return {
      ok: false,
      error: msg.includes("duplicate") ? "Ya existe un proveedor con esa cédula." : limpiar(msg),
    };
  }
  return { ok: true, id: data.id, nombre: data.nombre };
}

export async function confirmarGasto(formData: FormData): Promise<void> {
  await requerirPermiso("gastos.registrar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_gasto", { p_gasto: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/gastos/${id}`);
  revalidatePath("/gastos");
}

export async function anularGasto(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("gastos.registrar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_gasto", { p_gasto: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/gastos/${id}`);
  revalidatePath("/gastos");
  return { ok: "Gasto anulado." };
}
