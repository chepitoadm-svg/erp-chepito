"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import {
  crearArticuloSchema,
  editarArticuloSchema,
  cargaInicialSchema,
  crearAjusteSchema,
} from "@/lib/validation/inventario";

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

// === CARGA INICIAL =========================================================
export async function cargarSaldoInicial(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");
  const cantidad = String(formData.get("cantidad") ?? "").trim();
  const costo = String(formData.get("costo_unitario") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const parsed = cargaInicialSchema.safeParse({
    articulo_id: String(formData.get("articulo_id") ?? ""),
    bodega_id: String(formData.get("bodega_id") ?? ""),
    cantidad: cantidad ? Number(cantidad) : NaN,
    costo_unitario: costo ? Number(costo) : NaN,
    fecha: fecha || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cargar_saldo_inicial", {
    p_articulo: parsed.data.articulo_id,
    p_bodega: parsed.data.bodega_id,
    p_cantidad: parsed.data.cantidad,
    p_costo_unitario: parsed.data.costo_unitario,
    p_fecha: parsed.data.fecha ?? null,
  });
  if (error) return { error: limpiar(error.message) };

  revalidatePath("/inventario/carga-inicial");
  revalidatePath("/inventario/existencias");
  return { ok: "Existencia inicial cargada." };
}

// === AJUSTES DE INVENTARIO =================================================
export async function crearAjuste(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  const parsed = crearAjusteSchema.safeParse({
    bodega_id: String(formData.get("bodega_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    motivo: String(formData.get("motivo") ?? "").trim(),
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // Cabecera + líneas en una sola transacción (fn_crear_ajuste).
  const { data: id, error } = await supabase.rpc("fn_crear_ajuste", {
    p_bodega: parsed.data.bodega_id,
    p_fecha: parsed.data.fecha,
    p_motivo: parsed.data.motivo,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      direccion: l.direccion,
      cantidad: l.cantidad,
      detalle: l.detalle ?? null,
    })),
  });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo crear el ajuste.") };

  redirect(`/inventario/ajustes/${id}`);
}

export async function confirmarAjuste(formData: FormData): Promise<void> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_ajuste", { p_ajuste: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/inventario/ajustes/${id}`);
  revalidatePath("/inventario/ajustes");
}

export async function anularAjuste(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_ajuste", { p_ajuste: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/inventario/ajustes/${id}`);
  revalidatePath("/inventario/ajustes");
  return { ok: "Ajuste anulado." };
}
