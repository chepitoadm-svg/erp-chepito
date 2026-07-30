// Capa de datos de COMPRAS (lecturas). Corre en el servidor con RLS.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Estado } from "@/types/database";

export interface ProveedorListado {
  id: string;
  cedula_juridica: string;
  nombre: string;
  condicion_venta_default: string | null;
  plazo_credito_default: number | null;
  cuenta_cxp_codigo: string | null;
  estado: Estado;
  n_mapeos: number;
}

interface ProveedorRowEmbebido {
  id: string;
  cedula_juridica: string;
  nombre: string;
  condicion_venta_default: string | null;
  plazo_credito_default: number | null;
  estado: Estado;
  cuenta: { codigo: string } | null;
  mapeos: { count: number }[];
}

export async function listarProveedores(): Promise<ProveedorListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select(
      "id, cedula_juridica, nombre, condicion_venta_default, plazo_credito_default, estado, " +
        "cuenta:cuentas!proveedores_cuenta_cxp_id_fkey(codigo), " +
        "mapeos:proveedor_articulos(count)",
    )
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);

  return ((data ?? []) as unknown as ProveedorRowEmbebido[]).map((p) => ({
    id: p.id,
    cedula_juridica: p.cedula_juridica,
    nombre: p.nombre,
    condicion_venta_default: p.condicion_venta_default,
    plazo_credito_default: p.plazo_credito_default,
    cuenta_cxp_codigo: p.cuenta?.codigo ?? null,
    estado: p.estado,
    n_mapeos: p.mapeos?.[0]?.count ?? 0,
  }));
}

export async function obtenerProveedor(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el proveedor: ${error.message}`);
  }
  return data;
}

export interface MapeoProveedor {
  id: string;
  codigo_comercial: string;
  articulo_id: string;
  articulo_codigo: string;
  articulo_nombre: string;
  unidad_compra_codigo: string;
  factor_a_stock: number;
  descripcion_proveedor: string | null;
}

interface MapeoRowEmbebido {
  id: string;
  codigo_comercial: string;
  articulo_id: string;
  factor_a_stock: number;
  descripcion_proveedor: string | null;
  articulo: { codigo: string; nombre: string } | null;
  unidad: { codigo: string } | null;
}

/** Mapeo código-comercial → artículo de un proveedor. */
export async function listarMapeoProveedor(proveedorId: string): Promise<MapeoProveedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedor_articulos")
    .select(
      "id, codigo_comercial, articulo_id, factor_a_stock, descripcion_proveedor, " +
        "articulo:articulos!proveedor_articulos_articulo_id_fkey(codigo, nombre), " +
        "unidad:unidades!proveedor_articulos_unidad_compra_id_fkey(codigo)",
    )
    .eq("proveedor_id", proveedorId)
    .order("codigo_comercial");
  if (error) throw new Error(`No se pudo cargar el mapeo: ${error.message}`);

  return ((data ?? []) as unknown as MapeoRowEmbebido[]).map((m) => ({
    id: m.id,
    codigo_comercial: m.codigo_comercial,
    articulo_id: m.articulo_id,
    articulo_codigo: m.articulo?.codigo ?? "",
    articulo_nombre: m.articulo?.nombre ?? "",
    unidad_compra_codigo: m.unidad?.codigo ?? "",
    factor_a_stock: Number(m.factor_a_stock),
    descripcion_proveedor: m.descripcion_proveedor,
  }));
}

/** Cuentas de CxP (21-10-01…) que aceptan movimiento, para el selector. */
export async function listarCuentasCxp() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .like("codigo", "21-10-01-%")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas: ${error.message}`);
  return data ?? [];
}

/** Proveedores activos, para el selector de la factura. */
export async function listarProveedoresActivos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, cedula_juridica, nombre, condicion_venta_default, plazo_credito_default")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`);
  return data ?? [];
}

export type FacturaEstado = "borrador" | "confirmada" | "anulada";

export interface FacturaListado {
  id: string;
  fecha_emision: string;
  clave: string | null;
  proveedor_nombre: string;
  total: number;
  estado: FacturaEstado;
  n_lineas: number;
}

interface FacturaRowEmbebido {
  id: string;
  fecha_emision: string;
  clave: string | null;
  total: number;
  estado: FacturaEstado;
  proveedor: { nombre: string } | null;
  lineas: { count: number }[];
}

export async function listarFacturas(): Promise<FacturaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facturas_compra")
    .select(
      "id, fecha_emision, clave, total, estado, " +
        "proveedor:proveedores(nombre), lineas:facturas_compra_lineas(count)",
    )
    .order("fecha_emision", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las facturas: ${error.message}`);

  return ((data ?? []) as unknown as FacturaRowEmbebido[]).map((f) => ({
    id: f.id,
    fecha_emision: f.fecha_emision,
    clave: f.clave,
    proveedor_nombre: f.proveedor?.nombre ?? "",
    total: Number(f.total),
    estado: f.estado,
    n_lineas: f.lineas?.[0]?.count ?? 0,
  }));
}

export interface FacturaLineaDetalle {
  linea: number;
  codigo_comercial: string | null;
  articulo_id: string;
  articulo_codigo: string;
  articulo_nombre: string;
  cantidad: number;
  costo_unitario: number;
  base_imponible: number;
  iva_codigo: string | null;
  iva_monto: number;
  detalle: string | null;
}

export interface FacturaDetalle {
  id: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  clave: string | null;
  condicion_venta: string | null;
  plazo_credito: number | null;
  proveedor_nombre: string;
  proveedor_cedula: string;
  bodega_id: string | null;
  bodega_codigo: string | null;
  bodega_nombre: string | null;
  subtotal: number;
  iva_total: number;
  total: number;
  estado: FacturaEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
  cxp_saldo: number | null;
  cxp_estado: string | null;
  lineas: FacturaLineaDetalle[];
}

interface FacturaDetalleEmbebido {
  id: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  clave: string | null;
  condicion_venta: string | null;
  plazo_credito: number | null;
  subtotal: number;
  iva_total: number;
  total: number;
  estado: FacturaEstado;
  asiento_id: string | null;
  proveedor: { nombre: string; cedula_juridica: string } | null;
  bodega: { id: string; codigo: string; nombre: string } | null;
  asiento: { numero: number | null } | null;
  cxp: { saldo: number; estado: string }[];
  lineas: {
    linea: number;
    codigo_comercial: string | null;
    cantidad: number;
    costo_unitario: number;
    base_imponible: number;
    iva_monto: number;
    detalle: string | null;
    articulo: { id: string; codigo: string; nombre: string } | null;
    iva: { codigo: string } | null;
  }[];
}

export async function obtenerFactura(id: string): Promise<FacturaDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facturas_compra")
    .select(
      "id, fecha_emision, fecha_vencimiento, clave, condicion_venta, plazo_credito, " +
        "subtotal, iva_total, total, estado, asiento_id, " +
        "proveedor:proveedores(nombre, cedula_juridica), " +
        "bodega:bodegas(id, codigo, nombre), asiento:asientos(numero), " +
        "cxp:cuentas_por_pagar(saldo, estado), " +
        "lineas:facturas_compra_lineas(linea, codigo_comercial, cantidad, costo_unitario, " +
        "base_imponible, iva_monto, detalle, articulo:articulos(id, codigo, nombre), " +
        "iva:iva_tarifas(codigo))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la factura: ${error.message}`);
  }

  const f = data as unknown as FacturaDetalleEmbebido;
  const cxp = f.cxp?.[0];
  return {
    id: f.id,
    fecha_emision: f.fecha_emision,
    fecha_vencimiento: f.fecha_vencimiento,
    clave: f.clave,
    condicion_venta: f.condicion_venta,
    plazo_credito: f.plazo_credito,
    proveedor_nombre: f.proveedor?.nombre ?? "",
    proveedor_cedula: f.proveedor?.cedula_juridica ?? "",
    bodega_id: f.bodega?.id ?? null,
    bodega_codigo: f.bodega?.codigo ?? null,
    bodega_nombre: f.bodega?.nombre ?? null,
    subtotal: Number(f.subtotal),
    iva_total: Number(f.iva_total),
    total: Number(f.total),
    estado: f.estado,
    asiento_id: f.asiento_id,
    asiento_numero: f.asiento?.numero ?? null,
    cxp_saldo: cxp ? Number(cxp.saldo) : null,
    cxp_estado: cxp?.estado ?? null,
    lineas: (f.lineas ?? [])
      .sort((x, y) => x.linea - y.linea)
      .map((l) => ({
        linea: l.linea,
        codigo_comercial: l.codigo_comercial,
        articulo_id: l.articulo?.id ?? "",
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
        base_imponible: Number(l.base_imponible),
        iva_codigo: l.iva?.codigo ?? null,
        iva_monto: Number(l.iva_monto),
        detalle: l.detalle,
      })),
  };
}

export interface CxPFila {
  id: string;
  fecha: string;
  fecha_vencimiento: string | null;
  proveedor_nombre: string;
  factura_clave: string | null;
  factura_id: string | null;
  monto_original: number;
  saldo: number;
  estado: string;
}

interface CxPRowEmbebido {
  id: string;
  fecha: string;
  fecha_vencimiento: string | null;
  monto_original: number;
  saldo: number;
  estado: string;
  factura_id: string | null;
  proveedor: { nombre: string } | null;
  factura: { clave: string | null } | null;
}

/** Cuentas por pagar con saldo, para el listado de antigüedad. */
export async function listarCxP(): Promise<CxPFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas_por_pagar")
    .select(
      "id, fecha, fecha_vencimiento, monto_original, saldo, estado, factura_id, " +
        "proveedor:proveedores(nombre), factura:facturas_compra(clave)",
    )
    .order("fecha_vencimiento", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las cuentas por pagar: ${error.message}`);

  return ((data ?? []) as unknown as CxPRowEmbebido[]).map((q) => ({
    id: q.id,
    fecha: q.fecha,
    fecha_vencimiento: q.fecha_vencimiento,
    proveedor_nombre: q.proveedor?.nombre ?? "",
    factura_clave: q.factura?.clave ?? null,
    factura_id: q.factura_id,
    monto_original: Number(q.monto_original),
    saldo: Number(q.saldo),
    estado: q.estado,
  }));
}

// === PAGOS A PROVEEDORES ===================================================
/** Cuentas de caja (11-10-10) y bancos (11-10-15) para el origen del pago. */
export async function listarCuentasPago() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .or("codigo.like.11-10-10-%,codigo.like.11-10-15-%")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas de pago: ${error.message}`);
  return data ?? [];
}

export interface ProveedorConCxP {
  proveedor_id: string;
  proveedor_nombre: string;
  n_facturas: number;
  total_pendiente: number;
}

/** Proveedores con facturas pendientes de pago (para elegir a quién pagar). */
export async function listarProveedoresConCxP(): Promise<ProveedorConCxP[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas_por_pagar")
    .select("proveedor_id, saldo, proveedor:proveedores(nombre)")
    .eq("estado", "pendiente")
    .gt("saldo", 0);
  if (error) throw new Error(`No se pudieron cargar las cuentas por pagar: ${error.message}`);

  const acc = new Map<string, ProveedorConCxP>();
  for (const q of (data ?? []) as unknown as {
    proveedor_id: string;
    saldo: number;
    proveedor: { nombre: string } | null;
  }[]) {
    const cur = acc.get(q.proveedor_id) ?? {
      proveedor_id: q.proveedor_id,
      proveedor_nombre: q.proveedor?.nombre ?? "",
      n_facturas: 0,
      total_pendiente: 0,
    };
    cur.n_facturas += 1;
    cur.total_pendiente += Number(q.saldo);
    acc.set(q.proveedor_id, cur);
  }
  return [...acc.values()].sort((a, b) => a.proveedor_nombre.localeCompare(b.proveedor_nombre));
}

export interface CxPPendiente {
  id: string;
  fecha: string;
  fecha_vencimiento: string | null;
  factura_clave: string | null;
  monto_original: number;
  saldo: number;
}

/** CxP pendientes de un proveedor, para armar el pago. */
export async function listarCxPPendientes(proveedorId: string): Promise<CxPPendiente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas_por_pagar")
    .select("id, fecha, fecha_vencimiento, monto_original, saldo, factura:facturas_compra(clave)")
    .eq("proveedor_id", proveedorId)
    .eq("estado", "pendiente")
    .gt("saldo", 0)
    .order("fecha_vencimiento", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las facturas pendientes: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    fecha_vencimiento: string | null;
    monto_original: number;
    saldo: number;
    factura: { clave: string | null } | null;
  }[]).map((q) => ({
    id: q.id,
    fecha: q.fecha,
    fecha_vencimiento: q.fecha_vencimiento,
    factura_clave: q.factura?.clave ?? null,
    monto_original: Number(q.monto_original),
    saldo: Number(q.saldo),
  }));
}

export type PagoEstado = "borrador" | "confirmado" | "anulado";
const MEDIO_LBL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  otro: "Otro",
};
export function medioLabel(m: string): string {
  return MEDIO_LBL[m] ?? m;
}

export interface PagoListado {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  medio_pago: string;
  cuenta_codigo: string;
  monto_total: number;
  estado: PagoEstado;
}

export async function listarPagos(): Promise<PagoListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos_proveedor")
    .select(
      "id, fecha, medio_pago, monto_total, estado, " +
        "proveedor:proveedores(nombre), cuenta:cuentas(codigo)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los pagos: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    medio_pago: string;
    monto_total: number;
    estado: PagoEstado;
    proveedor: { nombre: string } | null;
    cuenta: { codigo: string } | null;
  }[]).map((p) => ({
    id: p.id,
    fecha: p.fecha,
    proveedor_nombre: p.proveedor?.nombre ?? "",
    medio_pago: p.medio_pago,
    cuenta_codigo: p.cuenta?.codigo ?? "",
    monto_total: Number(p.monto_total),
    estado: p.estado,
  }));
}

export interface PagoLineaDetalle {
  linea: number;
  factura_clave: string | null;
  factura_id: string | null;
  monto: number;
}

export interface PagoDetalle {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  medio_pago: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  referencia: string | null;
  glosa: string | null;
  monto_total: number;
  estado: PagoEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: PagoLineaDetalle[];
}

export async function obtenerPago(id: string): Promise<PagoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos_proveedor")
    .select(
      "id, fecha, medio_pago, referencia, glosa, monto_total, estado, asiento_id, " +
        "proveedor:proveedores(nombre), cuenta:cuentas(codigo, nombre), asiento:asientos(numero), " +
        "lineas:pagos_proveedor_lineas(linea, monto, cxp:cuentas_por_pagar(factura_id, factura:facturas_compra(clave)))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el pago: ${error.message}`);
  }
  const p = data as unknown as {
    id: string;
    fecha: string;
    medio_pago: string;
    referencia: string | null;
    glosa: string | null;
    monto_total: number;
    estado: PagoEstado;
    asiento_id: string | null;
    proveedor: { nombre: string } | null;
    cuenta: { codigo: string; nombre: string } | null;
    asiento: { numero: number | null } | null;
    lineas: {
      linea: number;
      monto: number;
      cxp: { factura_id: string | null; factura: { clave: string | null } | null } | null;
    }[];
  };
  return {
    id: p.id,
    fecha: p.fecha,
    proveedor_nombre: p.proveedor?.nombre ?? "",
    medio_pago: p.medio_pago,
    cuenta_codigo: p.cuenta?.codigo ?? "",
    cuenta_nombre: p.cuenta?.nombre ?? "",
    referencia: p.referencia,
    glosa: p.glosa,
    monto_total: Number(p.monto_total),
    estado: p.estado,
    asiento_id: p.asiento_id,
    asiento_numero: p.asiento?.numero ?? null,
    lineas: (p.lineas ?? [])
      .sort((a, b) => a.linea - b.linea)
      .map((l) => ({
        linea: l.linea,
        factura_clave: l.cxp?.factura?.clave ?? null,
        factura_id: l.cxp?.factura_id ?? null,
        monto: Number(l.monto),
      })),
  };
}

// === INGESTOR DE XML =======================================================
export type IngestaEstado =
  | "recibido"
  | "validado"
  | "requiere_mapeo"
  | "procesado"
  | "error"
  | "descartado";

export interface IngestaLineaParseada {
  numero: number;
  codigo_comercial: string | null;
  detalle: string;
  cantidad: number;
  unidad_comercial: string | null;
  base_imponible: number;
  iva_monto: number;
  articulo_id: string | null; // resuelto vía proveedor_articulos (null = sin mapear)
  articulo_codigo: string | null;
  mapeado: boolean;
}

export interface IngestaListado {
  id: string;
  clave: string | null;
  fecha_emision: string | null;
  emisor_nombre: string | null;
  proveedor_nombre: string | null;
  total: number | null;
  estado: IngestaEstado;
  estado_hacienda: string | null;
}

interface IngestaRowEmbebido {
  id: string;
  clave: string | null;
  fecha_emision: string | null;
  emisor_nombre: string | null;
  total: number | null;
  estado: IngestaEstado;
  estado_hacienda: string | null;
  proveedor: { nombre: string } | null;
}

export async function listarIngesta(): Promise<IngestaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_ingesta")
    .select(
      "id, clave, fecha_emision, emisor_nombre, total, estado, estado_hacienda, " +
        "proveedor:proveedores(nombre)",
    )
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudo cargar la bandeja del ingestor: ${error.message}`);
  return ((data ?? []) as unknown as IngestaRowEmbebido[]).map((c) => ({
    id: c.id,
    clave: c.clave,
    fecha_emision: c.fecha_emision,
    emisor_nombre: c.emisor_nombre,
    proveedor_nombre: c.proveedor?.nombre ?? null,
    total: c.total != null ? Number(c.total) : null,
    estado: c.estado,
    estado_hacienda: c.estado_hacienda,
  }));
}

export interface IngestaDetalle {
  id: string;
  clave: string | null;
  tipo_documento: string | null;
  estado: IngestaEstado;
  estado_hacienda: string | null;
  emisor_cedula: string | null;
  emisor_nombre: string | null;
  receptor_cedula: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  condicion_venta: string | null;
  plazo_credito: number | null;
  subtotal: number | null;
  iva_total: number | null;
  total: number | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  factura_id: string | null;
  error_detalle: string | null;
  lineas: IngestaLineaParseada[];
}

interface IngestaDetalleEmbebido {
  id: string;
  clave: string | null;
  tipo_documento: string | null;
  estado: IngestaEstado;
  estado_hacienda: string | null;
  emisor_cedula: string | null;
  emisor_nombre: string | null;
  receptor_cedula: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  condicion_venta: string | null;
  plazo_credito: number | null;
  subtotal: number | null;
  iva_total: number | null;
  total: number | null;
  proveedor_id: string | null;
  factura_id: string | null;
  error_detalle: string | null;
  lineas: IngestaLineaParseada[] | null;
  proveedor: { nombre: string } | null;
}

export async function obtenerIngesta(id: string): Promise<IngestaDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comprobantes_ingesta")
    .select("*, proveedor:proveedores(nombre)")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el comprobante: ${error.message}`);
  }
  const c = data as unknown as IngestaDetalleEmbebido;
  return {
    id: c.id,
    clave: c.clave,
    tipo_documento: c.tipo_documento,
    estado: c.estado,
    estado_hacienda: c.estado_hacienda,
    emisor_cedula: c.emisor_cedula,
    emisor_nombre: c.emisor_nombre,
    receptor_cedula: c.receptor_cedula,
    fecha_emision: c.fecha_emision,
    fecha_vencimiento: c.fecha_vencimiento,
    condicion_venta: c.condicion_venta,
    plazo_credito: c.plazo_credito,
    subtotal: c.subtotal != null ? Number(c.subtotal) : null,
    iva_total: c.iva_total != null ? Number(c.iva_total) : null,
    total: c.total != null ? Number(c.total) : null,
    proveedor_id: c.proveedor_id,
    proveedor_nombre: c.proveedor?.nombre ?? null,
    factura_id: c.factura_id,
    error_detalle: c.error_detalle,
    lineas: (c.lineas ?? []) as IngestaLineaParseada[],
  };
}

// === RECEPCIONES (D2) ======================================================
export type RecepcionEstado = "borrador" | "confirmada" | "anulada";

export interface RecepcionListado {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  bodega_codigo: string;
  estado: RecepcionEstado;
  facturada: boolean;
  n_lineas: number;
}

interface RecepRowEmbebido {
  id: string;
  fecha: string;
  estado: RecepcionEstado;
  facturada: boolean;
  proveedor: { nombre: string } | null;
  bodega: { codigo: string } | null;
  lineas: { count: number }[];
}

export async function listarRecepciones(): Promise<RecepcionListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recepciones")
    .select(
      "id, fecha, estado, facturada, proveedor:proveedores(nombre), " +
        "bodega:bodegas(codigo), lineas:recepciones_lineas(count)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las recepciones: ${error.message}`);
  return ((data ?? []) as unknown as RecepRowEmbebido[]).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    proveedor_nombre: r.proveedor?.nombre ?? "",
    bodega_codigo: r.bodega?.codigo ?? "",
    estado: r.estado,
    facturada: r.facturada,
    n_lineas: r.lineas?.[0]?.count ?? 0,
  }));
}

export interface RecepcionLineaDetalle {
  linea: number;
  articulo_id: string;
  articulo_codigo: string;
  articulo_nombre: string;
  iva_tarifa_id: string;
  cantidad: number;
  costo_unitario: number;
  detalle: string | null;
}

export interface RecepcionDetalle {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  bodega_codigo: string;
  glosa: string | null;
  estado: RecepcionEstado;
  facturada: boolean;
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: RecepcionLineaDetalle[];
}

interface RecepDetalleEmbebido {
  id: string;
  fecha: string;
  glosa: string | null;
  estado: RecepcionEstado;
  facturada: boolean;
  asiento_id: string | null;
  proveedor: { nombre: string } | null;
  bodega: { codigo: string } | null;
  asiento: { numero: number | null } | null;
  lineas: {
    linea: number;
    cantidad: number;
    costo_unitario: number;
    detalle: string | null;
    articulo: { id: string; codigo: string; nombre: string; iva_tarifa_id: string } | null;
  }[];
}

export async function obtenerRecepcion(id: string): Promise<RecepcionDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recepciones")
    .select(
      "id, fecha, glosa, estado, facturada, asiento_id, " +
        "proveedor:proveedores(nombre), bodega:bodegas(codigo), asiento:asientos(numero), " +
        "lineas:recepciones_lineas(linea, cantidad, costo_unitario, detalle, " +
        "articulo:articulos(id, codigo, nombre, iva_tarifa_id))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la recepción: ${error.message}`);
  }
  const r = data as unknown as RecepDetalleEmbebido;
  return {
    id: r.id,
    fecha: r.fecha,
    proveedor_nombre: r.proveedor?.nombre ?? "",
    bodega_codigo: r.bodega?.codigo ?? "",
    glosa: r.glosa,
    estado: r.estado,
    facturada: r.facturada,
    asiento_id: r.asiento_id,
    asiento_numero: r.asiento?.numero ?? null,
    lineas: (r.lineas ?? [])
      .sort((x, y) => x.linea - y.linea)
      .map((l) => ({
        linea: l.linea,
        articulo_id: l.articulo?.id ?? "",
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        iva_tarifa_id: l.articulo?.iva_tarifa_id ?? "",
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
        detalle: l.detalle,
      })),
  };
}

// === DEVOLUCIONES DE COMPRA ================================================
export interface FacturaConfirmadaListado {
  id: string;
  fecha_emision: string;
  clave: string | null;
  proveedor_nombre: string;
  total: number;
}

interface FacturaConfEmbebido {
  id: string;
  fecha_emision: string;
  clave: string | null;
  total: number;
  proveedor: { nombre: string } | null;
}

/** Facturas confirmadas, para elegir de cuál devolver. */
export async function listarFacturasConfirmadas(): Promise<FacturaConfirmadaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facturas_compra")
    .select("id, fecha_emision, clave, total, proveedor:proveedores(nombre)")
    .eq("estado", "confirmada")
    .order("fecha_emision", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las facturas: ${error.message}`);
  return ((data ?? []) as unknown as FacturaConfEmbebido[]).map((f) => ({
    id: f.id,
    fecha_emision: f.fecha_emision,
    clave: f.clave,
    proveedor_nombre: f.proveedor?.nombre ?? "",
    total: Number(f.total),
  }));
}

export type DevolucionEstado = "borrador" | "confirmada" | "anulada";

export interface DevolucionListado {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  motivo: string;
  total: number;
  estado: DevolucionEstado;
}

interface DevRowEmbebido {
  id: string;
  fecha: string;
  motivo: string;
  total: number;
  estado: DevolucionEstado;
  proveedor: { nombre: string } | null;
}

export async function listarDevoluciones(): Promise<DevolucionListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devoluciones_compra")
    .select("id, fecha, motivo, total, estado, proveedor:proveedores(nombre)")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las devoluciones: ${error.message}`);
  return ((data ?? []) as unknown as DevRowEmbebido[]).map((d) => ({
    id: d.id,
    fecha: d.fecha,
    proveedor_nombre: d.proveedor?.nombre ?? "",
    motivo: d.motivo,
    total: Number(d.total),
    estado: d.estado,
  }));
}

export interface DevolucionLineaDetalle {
  linea: number;
  articulo_codigo: string;
  articulo_nombre: string;
  cantidad: number;
  base_imponible: number;
  iva_monto: number;
  detalle: string | null;
}

export interface DevolucionDetalle {
  id: string;
  fecha: string;
  proveedor_nombre: string;
  bodega_codigo: string;
  motivo: string;
  subtotal: number;
  iva_total: number;
  total: number;
  estado: DevolucionEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
  factura_id: string | null;
  factura_clave: string | null;
  lineas: DevolucionLineaDetalle[];
}

interface DevDetalleEmbebido {
  id: string;
  fecha: string;
  motivo: string;
  subtotal: number;
  iva_total: number;
  total: number;
  estado: DevolucionEstado;
  asiento_id: string | null;
  factura_id: string | null;
  proveedor: { nombre: string } | null;
  bodega: { codigo: string } | null;
  asiento: { numero: number | null } | null;
  factura: { clave: string | null } | null;
  lineas: {
    linea: number;
    cantidad: number;
    base_imponible: number;
    iva_monto: number;
    detalle: string | null;
    articulo: { codigo: string; nombre: string } | null;
  }[];
}

export async function obtenerDevolucion(id: string): Promise<DevolucionDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devoluciones_compra")
    .select(
      "id, fecha, motivo, subtotal, iva_total, total, estado, asiento_id, factura_id, " +
        "proveedor:proveedores(nombre), bodega:bodegas(codigo), asiento:asientos(numero), " +
        "factura:facturas_compra(clave), " +
        "lineas:devoluciones_compra_lineas(linea, cantidad, base_imponible, iva_monto, detalle, " +
        "articulo:articulos(codigo, nombre))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la devolución: ${error.message}`);
  }

  const d = data as unknown as DevDetalleEmbebido;
  return {
    id: d.id,
    fecha: d.fecha,
    proveedor_nombre: d.proveedor?.nombre ?? "",
    bodega_codigo: d.bodega?.codigo ?? "",
    motivo: d.motivo,
    subtotal: Number(d.subtotal),
    iva_total: Number(d.iva_total),
    total: Number(d.total),
    estado: d.estado,
    asiento_id: d.asiento_id,
    asiento_numero: d.asiento?.numero ?? null,
    factura_id: d.factura_id,
    factura_clave: d.factura?.clave ?? null,
    lineas: (d.lineas ?? [])
      .sort((x, y) => x.linea - y.linea)
      .map((l) => ({
        linea: l.linea,
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        cantidad: Number(l.cantidad),
        base_imponible: Number(l.base_imponible),
        iva_monto: Number(l.iva_monto),
        detalle: l.detalle,
      })),
  };
}
