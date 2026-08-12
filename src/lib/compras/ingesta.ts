// Núcleo de la ingesta de un comprobante XML. Sin sesión ni redirects: recibe un
// cliente Supabase ya listo (con sesión desde el ingestor, o service_role desde
// el endpoint del correo) y hace parse + validación + mapeo + guardar/reprocesar.
// Devuelve el id y el estado. Una sola fuente de verdad para ambos caminos.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseComprobante, parseRespuesta } from "@/lib/xml/comprobante";

type Sb = SupabaseClient<Database>;

export type IngestaResultado =
  | { ok: true; id: string; estado: string; nuevo: boolean }
  | { ok: false; error: string; code?: "parse" | "procesado" };

export async function ingestarComprobante(
  supabase: Sb,
  xmlComp: string,
  xmlResp: string | null,
): Promise<IngestaResultado> {
  let comp;
  try {
    comp = parseComprobante(xmlComp);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el XML del comprobante.", code: "parse" };
  }
  let resp = null;
  if (xmlResp) {
    try {
      resp = parseRespuesta(xmlResp);
    } catch {
      return { ok: false, error: "El segundo archivo no es un MensajeHacienda válido.", code: "parse" };
    }
    if (resp.clave && comp.clave && resp.clave !== comp.clave) {
      return { ok: false, error: "La respuesta no corresponde a ese comprobante (claves distintas).", code: "parse" };
    }
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
      precio_unitario: l.precio_unitario,
      subtotal_bruto: l.subtotal_bruto,
      descuento: l.descuento,
      especifico: l.especifico,
      base_imponible: l.base_imponible,
      iva_monto: l.iva_monto,
      iva_codigo_tarifa: l.iva_codigo_tarifa,
      iva_tarifa: l.iva_tarifa,
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

  const payload = {
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
  };

  // ¿Ya existe la misma clave? Si ya se volvió factura (procesado), es intocable.
  // Si no, re-ingresar REPROCESA (recupera descartados y toma correcciones del parser).
  if (comp.clave) {
    const { data: ya } = await supabase
      .from("comprobantes_ingesta")
      .select("id, estado")
      .eq("clave", comp.clave)
      .maybeSingle();
    if (ya) {
      if (ya.estado === "procesado") {
        return { ok: false, error: "Ese comprobante ya generó una factura.", code: "procesado" };
      }
      const { error: eUp } = await supabase.from("comprobantes_ingesta").update(payload).eq("id", ya.id);
      if (eUp) return { ok: false, error: eUp.message };
      return { ok: true, id: ya.id, estado, nuevo: false };
    }
  }

  const { data: ins, error } = await supabase
    .from("comprobantes_ingesta")
    .insert(payload)
    .select("id")
    .single();
  if (error || !ins) {
    return {
      ok: false,
      error: error?.message.includes("duplicate") ? "Ese comprobante ya fue ingresado." : (error?.message ?? "No se pudo guardar el comprobante."),
    };
  }
  return { ok: true, id: ins.id, estado, nuevo: true };
}
