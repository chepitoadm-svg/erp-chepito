"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import {
  crearProveedorSchema,
  editarProveedorSchema,
  agregarMapeoSchema,
  crearFacturaSchema,
  crearDevolucionSchema,
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

// === FACTURAS DE COMPRA (D1: 1 paso) =======================================
export async function crearFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.facturar");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  const clave = String(formData.get("clave") ?? "").trim();
  const cond = String(formData.get("condicion_venta") ?? "").trim();
  const plazo = String(formData.get("plazo_credito") ?? "").trim();
  const parsed = crearFacturaSchema.safeParse({
    proveedor_id: String(formData.get("proveedor_id") ?? ""),
    bodega_id: String(formData.get("bodega_id") ?? ""),
    clave: clave || null,
    fecha_emision: String(formData.get("fecha_emision") ?? ""),
    condicion_venta: cond || null,
    plazo_credito: plazo ? Number(plazo) : null,
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_factura", {
    p_proveedor: parsed.data.proveedor_id,
    p_bodega: parsed.data.bodega_id,
    p_clave: parsed.data.clave ?? null,
    p_fecha_emision: parsed.data.fecha_emision,
    p_condicion: parsed.data.condicion_venta ?? null,
    p_plazo: parsed.data.plazo_credito ?? null,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      codigo_comercial: l.codigo_comercial ?? null,
      cantidad: l.cantidad,
      costo_unitario: l.costo_unitario,
      iva_tarifa_id: l.iva_tarifa_id,
      detalle: l.detalle ?? null,
    })),
  });
  if (error || !id) {
    const dup = error?.message.includes("duplicate") || error?.message.includes("clave");
    return {
      error: dup
        ? "Ya se registró una factura con esa clave."
        : limpiar(error?.message ?? "No se pudo crear la factura."),
    };
  }

  redirect(`/compras/facturas/${id}`);
}

export async function confirmarFactura(formData: FormData): Promise<void> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_factura", { p_factura: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/compras/facturas/${id}`);
  revalidatePath("/compras/facturas");
  revalidatePath("/compras/cxp");
}

export async function anularFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_factura", { p_factura: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/compras/facturas/${id}`);
  revalidatePath("/compras/facturas");
  revalidatePath("/compras/cxp");
  return { ok: "Factura anulada." };
}

// === DEVOLUCIONES DE COMPRA (D3) ===========================================
export async function crearDevolucion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.facturar");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  const parsed = crearDevolucionSchema.safeParse({
    factura_id: String(formData.get("factura_id") ?? ""),
    bodega_id: String(formData.get("bodega_id") ?? ""),
    motivo: String(formData.get("motivo") ?? "").trim(),
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_devolucion", {
    p_factura: parsed.data.factura_id,
    p_bodega: parsed.data.bodega_id,
    p_motivo: parsed.data.motivo,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      cantidad: l.cantidad,
      detalle: l.detalle ?? null,
    })),
  });
  if (error || !id)
    return { error: limpiar(error?.message ?? "No se pudo crear la devolución.") };

  redirect(`/compras/devoluciones/${id}`);
}

export async function confirmarDevolucion(formData: FormData): Promise<void> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_devolucion", { p_dev: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/compras/devoluciones/${id}`);
  revalidatePath("/compras/devoluciones");
  revalidatePath("/compras/cxp");
}

export async function anularDevolucion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_devolucion", { p_dev: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/compras/devoluciones/${id}`);
  revalidatePath("/compras/devoluciones");
  revalidatePath("/compras/cxp");
  return { ok: "Devolución anulada." };
}
