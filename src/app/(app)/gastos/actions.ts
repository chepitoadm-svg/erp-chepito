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

// Lee del FormData los campos del gasto (compartido crear/editar).
function leerGasto(formData: FormData) {
  const desc = String(formData.get("descripcion") ?? "").trim();
  const porPagar = String(formData.get("modo") ?? "pagado") === "por_pagar";
  const cuentaPago = String(formData.get("cuenta_pago_id") ?? "").trim();
  const proveedor = String(formData.get("proveedor_id") ?? "").trim();
  const vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim();
  return {
    centro_costo_id: String(formData.get("centro_costo_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    cuenta_gasto_id: String(formData.get("cuenta_gasto_id") ?? ""),
    cuenta_pago_id: porPagar ? null : cuentaPago || null,
    proveedor_id: porPagar ? proveedor || null : null,
    fecha_vencimiento: porPagar ? vencimiento || null : null,
    subtotal: num(formData.get("subtotal")),
    iva: num(formData.get("iva")),
    descripcion: desc || null,
  };
}

// Edita un gasto. Borrador: actualiza en el acto. Confirmado: anula el viejo
// (reversa asiento + CxP) y crea+confirma el corregido (el asiento es inmutable).
export async function editarGasto(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("gastos.registrar");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el gasto." };
  const parsed = crearGastoSchema.safeParse(leerGasto(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: g } = await supabase.from("gastos").select("estado").eq("id", id).single();
  if (!g) return { error: "Gasto inexistente." };

  if (g.estado === "borrador") {
    const { error } = await supabase.rpc("fn_actualizar_gasto", {
      p_gasto: id,
      p_centro: d.centro_costo_id,
      p_fecha: d.fecha,
      p_cuenta_gasto: d.cuenta_gasto_id,
      p_cuenta_pago: d.cuenta_pago_id ?? null,
      p_subtotal: d.subtotal,
      p_iva: d.iva,
      p_descripcion: d.descripcion ?? null,
      p_proveedor: d.proveedor_id ?? null,
      p_vencimiento: d.fecha_vencimiento ?? null,
    });
    if (error) return { error: limpiar(error.message) };
    redirect(`/gastos/${id}`);
  }

  if (g.estado === "confirmado") {
    const { error: eAnul } = await supabase.rpc("fn_anular_gasto", {
      p_gasto: id,
      p_motivo: "Editado (corrección)",
    });
    if (eAnul) {
      const m = eAnul.message;
      return {
        error: m.includes("pagos aplicados")
          ? "Este gasto ya tiene un pago aplicado; anulá el pago antes de editarlo."
          : limpiar(m),
      };
    }
    const { data: nuevoId, error: eCrear } = await supabase.rpc("fn_crear_gasto", {
      p_centro: d.centro_costo_id,
      p_fecha: d.fecha,
      p_cuenta_gasto: d.cuenta_gasto_id,
      p_cuenta_pago: d.cuenta_pago_id ?? null,
      p_subtotal: d.subtotal,
      p_iva: d.iva,
      p_descripcion: d.descripcion ?? null,
      p_proveedor: d.proveedor_id ?? null,
      p_vencimiento: d.fecha_vencimiento ?? null,
    });
    if (eCrear || !nuevoId) return { error: limpiar(eCrear?.message ?? "No se pudo recrear el gasto.") };
    const { error: eConf } = await supabase.rpc("fn_confirmar_gasto", { p_gasto: nuevoId });
    if (eConf) return { error: limpiar(eConf.message) };
    revalidatePath("/gastos");
    redirect(`/gastos/${nuevoId}`);
  }

  return { error: "Un gasto anulado no se edita." };
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
