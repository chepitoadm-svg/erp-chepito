"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearInsumoSchema, editarInsumoSchema, guardarRecetaSchema } from "@/lib/validation/produccion";

export interface FormState {
  error?: string;
  ok?: string;
}

// Quita el prefijo técnico de los errores de Postgres para mostrar algo legible.
function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Convierte un campo numérico del form (acepta coma decimal) a número o NaN.
function numCampo(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
}

function leerInsumo(formData: FormData) {
  const prov = String(formData.get("proveedor") ?? "").trim();
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    costo_compra: numCampo(formData.get("costo_compra")),
    cantidad_compra: numCampo(formData.get("cantidad_compra")),
    unidad: String(formData.get("unidad") ?? ""),
    proveedor: prov || null,
  };
}

export async function crearInsumoManual(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("produccion.gestionar");
  const parsed = crearInsumoSchema.safeParse(leerInsumo(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("insumos_manuales").insert(parsed.data);
  if (error) return { error: limpiar(error.message) };

  revalidatePath("/produccion");
  redirect("/produccion");
}

export async function editarInsumoManual(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("produccion.gestionar");
  const id = String(formData.get("id") ?? "");
  const parsed = editarInsumoSchema.safeParse({ id, ...leerInsumo(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id: _id, ...cambios } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("insumos_manuales").update(cambios).eq("id", id);
  if (error) return { error: limpiar(error.message) };

  revalidatePath("/produccion");
  redirect("/produccion");
}

// Activa / desactiva un insumo manual (anular, nunca borrar).
export async function alternarInsumoEstado(formData: FormData): Promise<void> {
  await requerirPermiso("produccion.gestionar");
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const nuevo = estado === "activo" ? "inactivo" : "activo";
  const supabase = await createClient();
  await supabase.from("insumos_manuales").update({ estado: nuevo }).eq("id", id);
  revalidatePath("/produccion");
}

// === Recetas / productos ===================================================
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

interface LineaCruda {
  tipo_ref?: string;
  ref_id?: string;
  cantidad?: unknown;
  unidad?: string;
}

export async function guardarReceta(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("produccion.gestionar");

  // Las líneas vienen serializadas como JSON desde el formulario.
  let lineasCrudas: LineaCruda[] = [];
  try {
    lineasCrudas = JSON.parse(String(formData.get("lineas_json") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer las líneas." };
  }

  const entrada = {
    id: (String(formData.get("id") ?? "").trim() || null) as string | null,
    nombre: String(formData.get("nombre") ?? "").trim(),
    es_producto: String(formData.get("es_producto") ?? "") === "true",
    clasificacion: String(formData.get("clasificacion") ?? "").trim() || null,
    rinde_cantidad: numOrNull(formData.get("rinde_cantidad")),
    rinde_unidad: (String(formData.get("rinde_unidad") ?? "").trim() || null) as string | null,
    precio_venta: numOrNull(formData.get("precio_venta")),
    lineas: lineasCrudas.map((l) => ({
      tipo_ref: String(l.tipo_ref ?? ""),
      ref_id: String(l.ref_id ?? ""),
      cantidad: Number(l.cantidad),
      unidad: String(l.unidad ?? ""),
    })),
  };

  const parsed = guardarRecetaSchema.safeParse(entrada);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Un producto no lleva rendimiento; una intermedia no lleva precio.
  const payload = {
    id: d.id ?? null,
    nombre: d.nombre,
    es_producto: d.es_producto,
    clasificacion: d.clasificacion ?? null,
    rinde_cantidad: d.es_producto ? null : d.rinde_cantidad ?? null,
    rinde_unidad: d.es_producto ? null : d.rinde_unidad ?? null,
    precio_venta: d.es_producto ? d.precio_venta ?? null : null,
    lineas: d.lineas.map((l) => ({
      tipo_ref: l.tipo_ref,
      articulo_id: l.tipo_ref === "articulo" ? l.ref_id : null,
      insumo_manual_id: l.tipo_ref === "insumo_manual" ? l.ref_id : null,
      receta_ref_id: l.tipo_ref === "receta" ? l.ref_id : null,
      cantidad: l.cantidad,
      unidad: l.unidad,
    })),
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_receta", { p: payload });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("circular")) return { error: "Hay una receta que se usa a sí misma (referencia circular)." };
    return { error: limpiar(error.message) };
  }
  revalidatePath("/produccion");
  redirect("/produccion");
}

export async function alternarRecetaEstado(formData: FormData): Promise<void> {
  await requerirPermiso("produccion.gestionar");
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const nuevo = estado === "activo" ? "inactivo" : "activo";
  const supabase = await createClient();
  await supabase.from("recetas").update({ estado: nuevo }).eq("id", id);
  revalidatePath("/produccion");
}
