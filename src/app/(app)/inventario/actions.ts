"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { crearArticuloSchema, editarArticuloSchema } from "@/lib/validation/inventario";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Lee del FormData los campos comunes del artículo y los normaliza.
function leerArticulo(formData: FormData) {
  const cuenta = String(formData.get("cuenta_inventario_id") ?? "").trim();
  const cabys = String(formData.get("cabys_codigo") ?? "").trim();
  return {
    codigo: String(formData.get("codigo") ?? "").trim(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    tipo: String(formData.get("tipo") ?? "suministro"),
    unidad_stock_id: String(formData.get("unidad_stock_id") ?? ""),
    iva_tarifa_id: String(formData.get("iva_tarifa_id") ?? ""),
    cuenta_inventario_id: cuenta || null,
    cabys_codigo: cabys || null,
    inventariable: formData.get("inventariable") === "on",
  };
}

export async function crearArticulo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("articulos.gestionar");
  const parsed = crearArticuloSchema.safeParse(leerArticulo(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("articulos").insert(parsed.data);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe un artículo con ese código."
        : limpiar(error.message),
    };
  }
  revalidatePath("/inventario/articulos");
  return { ok: "Artículo creado." };
}

export async function editarArticulo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("articulos.gestionar");
  const id = String(formData.get("id") ?? "");
  const parsed = editarArticuloSchema.safeParse({ id, ...leerArticulo(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id: _id, ...cambios } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("articulos").update(cambios).eq("id", id);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe un artículo con ese código."
        : limpiar(error.message),
    };
  }
  revalidatePath("/inventario/articulos");
  revalidatePath(`/inventario/articulos/${id}`);
  return { ok: "Artículo actualizado." };
}

export async function alternarArticuloEstado(formData: FormData): Promise<void> {
  await requerirPermiso("articulos.gestionar");
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("articulos")
    .update({ estado: estado === "activo" ? "inactivo" : "activo" })
    .eq("id", id);
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/inventario/articulos");
}
