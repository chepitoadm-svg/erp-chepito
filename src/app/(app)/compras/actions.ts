"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import {
  crearProveedorSchema,
  editarProveedorSchema,
  agregarMapeoSchema,
} from "@/lib/validation/compras";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

function leerProveedor(formData: FormData) {
  const cond = String(formData.get("condicion_venta_default") ?? "").trim();
  const plazo = String(formData.get("plazo_credito_default") ?? "").trim();
  const cuenta = String(formData.get("cuenta_cxp_id") ?? "").trim();
  return {
    cedula_juridica: String(formData.get("cedula_juridica") ?? "").trim(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    condicion_venta_default: cond || null,
    plazo_credito_default: plazo ? Number(plazo) : null,
    cuenta_cxp_id: cuenta || null,
  };
}

export async function crearProveedor(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("proveedores.gestionar");
  const parsed = crearProveedorSchema.safeParse(leerProveedor(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").insert(parsed.data);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe un proveedor con esa cédula jurídica."
        : limpiar(error.message),
    };
  }
  revalidatePath("/compras/proveedores");
  return { ok: "Proveedor creado." };
}

export async function editarProveedor(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("proveedores.gestionar");
  const id = String(formData.get("id") ?? "");
  const parsed = editarProveedorSchema.safeParse({ id, ...leerProveedor(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id: _id, ...cambios } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").update(cambios).eq("id", id);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe un proveedor con esa cédula jurídica."
        : limpiar(error.message),
    };
  }
  revalidatePath("/compras/proveedores");
  revalidatePath(`/compras/proveedores/${id}`);
  return { ok: "Proveedor actualizado." };
}

export async function alternarProveedorEstado(formData: FormData): Promise<void> {
  await requerirPermiso("proveedores.gestionar");
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("proveedores")
    .update({ estado: estado === "activo" ? "inactivo" : "activo" })
    .eq("id", id);
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/compras/proveedores");
}

// === MAPEO CÓDIGO-COMERCIAL → ARTÍCULO ======================================
export async function agregarMapeo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("proveedores.gestionar");
  const factor = String(formData.get("factor_a_stock") ?? "").trim();
  const desc = String(formData.get("descripcion_proveedor") ?? "").trim();
  const parsed = agregarMapeoSchema.safeParse({
    proveedor_id: String(formData.get("proveedor_id") ?? ""),
    codigo_comercial: String(formData.get("codigo_comercial") ?? "").trim(),
    articulo_id: String(formData.get("articulo_id") ?? ""),
    unidad_compra_id: String(formData.get("unidad_compra_id") ?? ""),
    factor_a_stock: factor ? Number(factor) : NaN,
    descripcion_proveedor: desc || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("proveedor_articulos").insert(parsed.data);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ese código comercial ya está mapeado para este proveedor."
        : limpiar(error.message),
    };
  }
  revalidatePath(`/compras/proveedores/${parsed.data.proveedor_id}`);
  return { ok: "Mapeo agregado." };
}

export async function quitarMapeo(formData: FormData): Promise<void> {
  await requerirPermiso("proveedores.gestionar");
  const id = String(formData.get("id") ?? "");
  const proveedorId = String(formData.get("proveedor_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("proveedor_articulos").delete().eq("id", id);
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/compras/proveedores/${proveedorId}`);
}
