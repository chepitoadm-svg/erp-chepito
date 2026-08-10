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
  crearTransferenciaSchema,
  crearCierreSchema,
  crearDesechoSchema,
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

// === TRANSFERENCIAS ========================================================
export async function crearTransferencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.transferir");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  const glosa = String(formData.get("glosa") ?? "").trim();
  const parsed = crearTransferenciaSchema.safeParse({
    bodega_origen_id: String(formData.get("bodega_origen_id") ?? ""),
    bodega_destino_id: String(formData.get("bodega_destino_id") ?? ""),
    glosa: glosa || null,
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_transferencia", {
    p_origen: parsed.data.bodega_origen_id,
    p_destino: parsed.data.bodega_destino_id,
    p_glosa: parsed.data.glosa ?? null,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      cantidad: l.cantidad,
      detalle: l.detalle ?? null,
    })),
  });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo crear la transferencia.") };

  redirect(`/inventario/transferencias/${id}`);
}

export async function enviarTransferencia(formData: FormData): Promise<void> {
  await requerirPermiso("inventario.transferir");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_enviar_transferencia", { p_transf: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/inventario/transferencias/${id}`);
  revalidatePath("/inventario/transferencias");
}

export async function recibirTransferencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.transferir");
  const id = String(formData.get("id") ?? "");
  const modo = String(formData.get("modo") ?? "todo");

  let recibidas: { linea: number; cantidad: number }[] | null = null;
  if (modo === "parcial") {
    try {
      const raw = JSON.parse(String(formData.get("recibidas") ?? "[]")) as {
        linea: number;
        cantidad: number;
      }[];
      recibidas = raw.filter((r) => Number(r.cantidad) > 0);
    } catch {
      return { error: "Cantidades inválidas." };
    }
    if (recibidas.length === 0) return { error: "Indicá al menos una cantidad a recibir." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_recibir_transferencia", {
    p_transf: id,
    p_recibidas: recibidas ?? undefined,
  });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/inventario/transferencias/${id}`);
  revalidatePath("/inventario/transferencias");
  return { ok: "Recepción registrada." };
}

export async function anularTransferencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("inventario.transferir");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_transferencia", {
    p_transf: id,
    p_motivo: motivo,
  });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/inventario/transferencias/${id}`);
  revalidatePath("/inventario/transferencias");
  return { ok: "Transferencia anulada." };
}

// === CIERRE DE INVENTARIO (periódico) ======================================
export async function crearCierre(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Conteo inválido." };
  }
  const parsed = crearCierreSchema.safeParse({
    bodega_id: String(formData.get("bodega_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_cierre", {
    p_bodega: parsed.data.bodega_id,
    p_fecha: parsed.data.fecha,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      cantidad_fisica: l.cantidad_fisica,
    })),
  });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo crear el cierre.") };

  redirect(`/inventario/cierre/${id}`);
}

export async function confirmarCierre(formData: FormData): Promise<void> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_cierre", { p_cierre: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/inventario/cierre/${id}`);
  revalidatePath("/inventario/cierre");
}

export async function anularCierre(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_cierre", { p_cierre: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/inventario/cierre/${id}`);
  revalidatePath("/inventario/cierre");
  return { ok: "Cierre anulado." };
}

// === DESECHOS DE PRODUCTO TERMINADO ========================================
export async function crearDesecho(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }
  const parsed = crearDesechoSchema.safeParse({
    centro_costo_id: String(formData.get("centro_costo_id") ?? ""),
    fecha: String(formData.get("fecha") ?? ""),
    motivo: String(formData.get("motivo") ?? "danado"),
    glosa: String(formData.get("glosa") ?? "").trim() || null,
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_desecho", {
    p_centro: parsed.data.centro_costo_id,
    p_fecha: parsed.data.fecha,
    p_motivo: parsed.data.motivo,
    p_glosa: parsed.data.glosa ?? null,
    p_lineas: parsed.data.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      costo_unitario: l.costo_unitario,
    })),
  });
  if (error || !id) return { error: limpiar(error?.message ?? "No se pudo crear el desecho.") };

  redirect(`/inventario/desechos/${id}`);
}

export async function confirmarDesecho(formData: FormData): Promise<void> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_desecho", { p_desecho: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/inventario/desechos/${id}`);
  revalidatePath("/inventario/desechos");
}

export async function anularDesecho(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("inventario.ajustar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_desecho", { p_desecho: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/inventario/desechos/${id}`);
  revalidatePath("/inventario/desechos");
  return { ok: "Desecho anulado." };
}
