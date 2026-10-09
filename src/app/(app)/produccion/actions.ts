"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearInsumoSchema, editarInsumoSchema } from "@/lib/validation/produccion";

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
