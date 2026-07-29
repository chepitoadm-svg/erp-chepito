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
  crearRecepcionSchema,
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
  const recepcion = String(formData.get("recepcion_id") ?? "").trim();
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

  const lineasPayload = parsed.data.lineas.map((l) => ({
    articulo_id: l.articulo_id,
    codigo_comercial: l.codigo_comercial ?? null,
    cantidad: l.cantidad,
    costo_unitario: l.costo_unitario,
    iva_tarifa_id: l.iva_tarifa_id,
    detalle: l.detalle ?? null,
  }));

  const supabase = await createClient();
  // Caso B: la factura salda una recepción previa (fn_crear_factura_recepcion).
  // Caso A (normal 1 paso): fn_crear_factura, que exige bodega e ingresa el stock.
  const { data: id, error } = recepcion
    ? await supabase.rpc("fn_crear_factura_recepcion", {
        p_recepcion: recepcion,
        p_clave: parsed.data.clave ?? null,
        p_fecha_emision: parsed.data.fecha_emision,
        p_condicion: parsed.data.condicion_venta ?? null,
        p_plazo: parsed.data.plazo_credito ?? null,
        p_lineas: lineasPayload,
      })
    : await supabase.rpc("fn_crear_factura", {
        p_proveedor: parsed.data.proveedor_id,
        p_bodega: parsed.data.bodega_id,
        p_clave: parsed.data.clave ?? null,
        p_fecha_emision: parsed.data.fecha_emision,
        p_condicion: parsed.data.condicion_venta ?? null,
        p_plazo: parsed.data.plazo_credito ?? null,
        p_lineas: lineasPayload,
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

// === INGESTOR DE XML =======================================================
export async function subirComprobante(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.facturar");

  const fComp = formData.get("comprobante");
  const fResp = formData.get("respuesta");
  if (!(fComp instanceof File) || fComp.size === 0) {
    return { error: "Subí el XML del comprobante." };
  }
  const xmlComp = await fComp.text();
  const xmlResp = fResp instanceof File && fResp.size > 0 ? await fResp.text() : null;

  const { parseComprobante, parseRespuesta } = await import("@/lib/xml/comprobante");
  let comp;
  try {
    comp = parseComprobante(xmlComp);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el XML del comprobante." };
  }
  let resp = null;
  if (xmlResp) {
    try {
      resp = parseRespuesta(xmlResp);
    } catch {
      return { error: "El segundo archivo no es un MensajeHacienda válido." };
    }
    if (resp.clave && comp.clave && resp.clave !== comp.clave) {
      return { error: "La respuesta no corresponde a ese comprobante (claves distintas)." };
    }
  }

  const supabase = await createClient();

  // Idempotencia: no reingresar la misma clave.
  if (comp.clave) {
    const { data: ya } = await supabase
      .from("comprobantes_ingesta")
      .select("id")
      .eq("clave", comp.clave)
      .maybeSingle();
    if (ya) redirect(`/compras/ingestor/${ya.id}`);
  }

  // Receptor debe ser nuestra empresa.
  const { data: empresa } = await supabase.from("empresa").select("cedula_juridica").limit(1).single();
  const nuestraCedula = empresa?.cedula_juridica ?? null;

  // Proveedor por cédula del emisor.
  const { data: prov } = await supabase
    .from("proveedores")
    .select("id, estado")
    .eq("cedula_juridica", comp.emisor_cedula)
    .maybeSingle();
  const proveedorId = prov?.id ?? null;

  // Mapeo de líneas por CodigoComercial (aprende con el uso).
  let mapa = new Map<string, { articulo_id: string; codigo: string }>();
  if (proveedorId) {
    const { data: maps } = await supabase
      .from("proveedor_articulos")
      .select("codigo_comercial, articulo_id, articulo:articulos(codigo)")
      .eq("proveedor_id", proveedorId);
    mapa = new Map(
      (maps ?? []).map((m) => {
        const art = m.articulo as unknown as { codigo: string } | null;
        return [m.codigo_comercial, { articulo_id: m.articulo_id, codigo: art?.codigo ?? "" }];
      }),
    );
  }
  const lineas = comp.lineas.map((l) => {
    const hit = l.codigo_comercial ? mapa.get(l.codigo_comercial) : undefined;
    return {
      numero: l.numero,
      codigo_comercial: l.codigo_comercial,
      detalle: l.detalle,
      cantidad: l.cantidad,
      unidad_comercial: l.unidad_comercial,
      base_imponible: l.base_imponible,
      iva_monto: l.iva_monto,
      articulo_id: hit?.articulo_id ?? null,
      articulo_codigo: hit?.codigo ?? null,
      mapeado: !!hit,
    };
  });

  // Estado y diagnóstico.
  let estado = "validado";
  let errorDetalle: string | null = null;
  if (resp && resp.estado && resp.estado !== "Aceptado") {
    estado = "error";
    errorDetalle = `Hacienda no lo aceptó (EstadoMensaje = ${resp.estado}).`;
  } else if (nuestraCedula && comp.receptor_cedula && comp.receptor_cedula !== nuestraCedula) {
    estado = "error";
    errorDetalle = `El receptor del comprobante (${comp.receptor_cedula}) no es la empresa (${nuestraCedula}).`;
  } else if (!proveedorId) {
    estado = "error";
    errorDetalle = `No hay proveedor registrado con la cédula ${comp.emisor_cedula} (${comp.emisor_nombre}).`;
  } else if (lineas.some((l) => !l.mapeado)) {
    estado = "requiere_mapeo";
    errorDetalle = "Faltan artículos por mapear antes de crear la factura.";
  }

  const venc =
    comp.fecha_emision && comp.plazo_credito != null
      ? new Date(new Date(comp.fecha_emision + "T00:00:00").getTime() + comp.plazo_credito * 86400000)
          .toISOString()
          .slice(0, 10)
      : comp.fecha_emision;

  const { data: ins, error } = await supabase
    .from("comprobantes_ingesta")
    .insert({
      clave: comp.clave || null,
      tipo_documento: comp.tipo,
      estado,
      emisor_cedula: comp.emisor_cedula,
      emisor_nombre: comp.emisor_nombre,
      receptor_cedula: comp.receptor_cedula,
      consecutivo: comp.consecutivo,
      fecha_emision: comp.fecha_emision || null,
      condicion_venta: comp.condicion_venta,
      plazo_credito: comp.plazo_credito,
      fecha_vencimiento: venc || null,
      moneda: comp.moneda,
      tipo_cambio: comp.tipo_cambio,
      subtotal: comp.subtotal,
      iva_total: comp.iva_total,
      total: comp.total,
      estado_hacienda: resp?.estado ?? null,
      proveedor_id: proveedorId,
      error_detalle: errorDetalle,
      lineas,
      xml_comprobante: xmlComp,
      xml_respuesta: xmlResp,
    })
    .select("id")
    .single();
  if (error || !ins) {
    return {
      error: error?.message.includes("duplicate")
        ? "Ese comprobante ya fue ingresado."
        : limpiar(error?.message ?? "No se pudo guardar el comprobante."),
    };
  }

  revalidatePath("/compras/ingestor");
  redirect(`/compras/ingestor/${ins.id}`);
}

export async function descartarIngesta(formData: FormData): Promise<void> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("comprobantes_ingesta")
    .update({ estado: "descartado" })
    .eq("id", id);
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/compras/ingestor");
  revalidatePath(`/compras/ingestor/${id}`);
}

// === RECEPCIONES (D2) ======================================================
export async function crearRecepcion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.recibir");

  let lineasRaw: unknown = [];
  try {
    lineasRaw = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  const glosa = String(formData.get("glosa") ?? "").trim();
  const parsed = crearRecepcionSchema.safeParse({
    proveedor_id: String(formData.get("proveedor_id") ?? ""),
    bodega_id: String(formData.get("bodega_id") ?? ""),
    glosa: glosa || null,
    lineas: lineasRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_recepcion", {
    p_proveedor: parsed.data.proveedor_id,
    p_bodega: parsed.data.bodega_id,
    p_glosa: parsed.data.glosa ?? null,
    p_lineas: parsed.data.lineas.map((l) => ({
      articulo_id: l.articulo_id,
      cantidad: l.cantidad,
      costo_unitario: l.costo_unitario,
      detalle: l.detalle ?? null,
    })),
  });
  if (error || !id)
    return { error: limpiar(error?.message ?? "No se pudo crear la recepción.") };

  redirect(`/compras/recepciones/${id}`);
}

export async function confirmarRecepcion(formData: FormData): Promise<void> {
  await requerirPermiso("compras.recibir");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_confirmar_recepcion", { p_recep: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/compras/recepciones/${id}`);
  revalidatePath("/compras/recepciones");
}

export async function anularRecepcion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("compras.recibir");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_recepcion", { p_recep: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/compras/recepciones/${id}`);
  revalidatePath("/compras/recepciones");
  return { ok: "Recepción anulada." };
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
