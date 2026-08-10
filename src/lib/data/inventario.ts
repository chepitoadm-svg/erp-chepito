// Capa de datos de INVENTARIO (lecturas). Corre en el servidor con el cliente
// sujeto a RLS. Las escrituras viven en las Server Actions.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ArticuloTipo, Estado } from "@/types/database";

export interface ArticuloListado {
  id: string;
  codigo: string;
  nombre: string;
  tipo: ArticuloTipo;
  inventariable: boolean;
  estado: Estado;
  unidad_codigo: string;
  unidad_nombre: string;
  iva_codigo: string;
  iva_porcentaje: number;
  cuenta_codigo: string | null;
  cabys_codigo: string | null;
  existencia_total: number;
  valor_total: number;
  costo_promedio: number;
}

interface ArticuloRowEmbebido {
  id: string;
  codigo: string;
  nombre: string;
  tipo: ArticuloTipo;
  inventariable: boolean;
  estado: Estado;
  cabys_codigo: string | null;
  unidad: { codigo: string; nombre: string } | null;
  iva: { codigo: string; porcentaje: number } | null;
  cuenta: { codigo: string } | null;
}

/** Todos los artículos con su unidad, IVA, cuenta y saldos (para la lista). */
export async function listarArticulos(): Promise<ArticuloListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articulos")
    .select(
      "id, codigo, nombre, tipo, inventariable, estado, cabys_codigo, " +
        "unidad:unidades!articulos_unidad_stock_id_fkey(codigo, nombre), " +
        "iva:iva_tarifas!articulos_iva_tarifa_id_fkey(codigo, porcentaje), " +
        "cuenta:cuentas!articulos_cuenta_inventario_id_fkey(codigo)",
    )
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los artículos: ${error.message}`);

  const filas = (data ?? []) as unknown as ArticuloRowEmbebido[];

  // Saldos por separado: lectura sujeta a inventario.ver; si no hay permiso,
  // quedan en cero y la lista igual muestra el catálogo.
  const { data: saldos } = await supabase
    .from("articulos_saldos")
    .select("articulo_id, existencia_total, valor_total, costo_promedio");
  const porArticulo = new Map(
    (saldos ?? []).map((s) => [s.articulo_id, s]),
  );

  return filas.map((a) => {
    const s = porArticulo.get(a.id);
    return {
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      tipo: a.tipo,
      inventariable: a.inventariable,
      estado: a.estado,
      unidad_codigo: a.unidad?.codigo ?? "",
      unidad_nombre: a.unidad?.nombre ?? "",
      iva_codigo: a.iva?.codigo ?? "",
      iva_porcentaje: Number(a.iva?.porcentaje ?? 0),
      cuenta_codigo: a.cuenta?.codigo ?? null,
      cabys_codigo: a.cabys_codigo,
      existencia_total: Number(s?.existencia_total ?? 0),
      valor_total: Number(s?.valor_total ?? 0),
      costo_promedio: Number(s?.costo_promedio ?? 0),
    };
  });
}

export async function obtenerArticulo(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articulos")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // no encontrado
    throw new Error(`No se pudo cargar el artículo: ${error.message}`);
  }
  return data;
}

/** Unidades activas, para los selectores. */
export async function listarUnidades() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("id, codigo, nombre")
    .eq("activa", true)
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las unidades: ${error.message}`);
  return data ?? [];
}

/** Tarifas de IVA activas, para el selector del artículo. */
export async function listarTarifasIva() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iva_tarifas")
    .select("id, codigo, nombre, porcentaje")
    .eq("activa", true)
    .order("porcentaje", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las tarifas de IVA: ${error.message}`);
  return data ?? [];
}

/** Cuentas de la familia de inventarios (11-60) que aceptan movimiento. */
export async function listarCuentasInventario() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .like("codigo", "11-60-%")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas: ${error.message}`);
  return data ?? [];
}

export interface ExistenciaValorada {
  articulo_id: string;
  articulo_codigo: string;
  articulo_nombre: string;
  bodega_codigo: string;
  bodega_nombre: string;
  cantidad: number;
  costo_promedio: number;
  valor: number;
}

/** Existencias valoradas por bodega (vista, filtrada por sucursal vía RLS). */
export async function listarExistenciasValoradas(): Promise<ExistenciaValorada[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_existencias_valoradas")
    .select(
      "articulo_id, articulo_codigo, articulo_nombre, bodega_codigo, bodega_nombre, cantidad, costo_promedio, valor",
    )
    .order("articulo_codigo")
    .order("bodega_codigo");
  if (error) throw new Error(`No se pudieron cargar las existencias: ${error.message}`);
  return (data ?? []).map((e) => ({
    ...e,
    cantidad: Number(e.cantidad),
    costo_promedio: Number(e.costo_promedio),
    valor: Number(e.valor),
  }));
}

export interface KardexMovimiento {
  id: string;
  fecha: string;
  bodega_codigo: string;
  tipo: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  existencia_despues: number;
  promedio_despues: number;
  detalle: string | null;
}

/** Kardex (movimientos) de un artículo, orden cronológico. */
export async function listarKardex(articuloId: string): Promise<KardexMovimiento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_kardex")
    .select(
      "id, fecha, bodega_codigo, tipo, cantidad, costo_unitario, costo_total, existencia_despues, promedio_despues, detalle, creado_en",
    )
    .eq("articulo_id", articuloId)
    .order("fecha")
    .order("creado_en");
  if (error) throw new Error(`No se pudo cargar el kardex: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: m.id,
    fecha: m.fecha,
    bodega_codigo: m.bodega_codigo,
    tipo: m.tipo,
    cantidad: Number(m.cantidad),
    costo_unitario: Number(m.costo_unitario),
    costo_total: Number(m.costo_total),
    existencia_despues: Number(m.existencia_despues),
    promedio_despues: Number(m.promedio_despues),
    detalle: m.detalle,
  }));
}

/** Artículos activos (para selectores de kardex, ajustes, transferencias, facturas). */
export async function listarArticulosParaSelector() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articulos")
    .select("id, codigo, nombre, iva_tarifa_id")
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los artículos: ${error.message}`);
  return data ?? [];
}

export interface LibroInventarioFila {
  articulo_codigo: string;
  articulo_nombre: string;
  bodega_codigo: string;
  cantidad: number;
  costo_promedio: number;
  valor: number;
}

/** Libro de Inventarios a una fecha (función legal de CR). */
export async function libroInventarios(fecha: string): Promise<LibroInventarioFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_libro_inventarios", { p_fecha: fecha });
  if (error) throw new Error(`No se pudo generar el libro de Inventarios: ${error.message}`);
  return (data ?? []).map((f) => ({
    ...f,
    cantidad: Number(f.cantidad),
    costo_promedio: Number(f.costo_promedio),
    valor: Number(f.valor),
  }));
}

/** Bodegas activas visibles para el usuario (RLS por sucursal). */
export async function listarBodegas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bodegas")
    .select("id, codigo, nombre, sucursal_id")
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las bodegas: ${error.message}`);
  return data ?? [];
}

export interface ConciliacionInicial {
  valor_kardex_inicial: number;
  valor_apertura_contable: number;
  diferencia: number;
}

/** Conciliación de la carga inicial contra el asiento de apertura. */
export async function conciliacionInicial(): Promise<ConciliacionInicial> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliar_inventario_inicial");
  if (error) throw new Error(`No se pudo conciliar el inventario inicial: ${error.message}`);
  const fila = (data ?? [])[0];
  return {
    valor_kardex_inicial: Number(fila?.valor_kardex_inicial ?? 0),
    valor_apertura_contable: Number(fila?.valor_apertura_contable ?? 0),
    diferencia: Number(fila?.diferencia ?? 0),
  };
}

export interface CargaInicialFila {
  id: string;
  fecha: string;
  articulo_codigo: string;
  articulo_nombre: string;
  bodega_codigo: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
}

/** Movimientos de carga inicial (saldo_inicial), lo más reciente primero. */
export async function listarCargasIniciales(): Promise<CargaInicialFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_kardex")
    .select(
      "id, fecha, articulo_codigo, articulo_nombre, bodega_codigo, cantidad, costo_unitario, costo_total, creado_en",
    )
    .eq("tipo", "saldo_inicial")
    .order("creado_en", { ascending: false })
    .limit(100);
  if (error) throw new Error(`No se pudieron cargar los saldos iniciales: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: m.id,
    fecha: m.fecha,
    articulo_codigo: m.articulo_codigo,
    articulo_nombre: m.articulo_nombre,
    bodega_codigo: m.bodega_codigo,
    cantidad: Number(m.cantidad),
    costo_unitario: Number(m.costo_unitario),
    costo_total: Number(m.costo_total),
  }));
}

export interface AjusteListado {
  id: string;
  fecha: string;
  bodega_codigo: string;
  bodega_nombre: string;
  motivo: string;
  estado: "borrador" | "confirmado" | "anulado";
  n_lineas: number;
  asiento_id: string | null;
}

interface AjusteRowEmbebido {
  id: string;
  fecha: string;
  motivo: string;
  estado: "borrador" | "confirmado" | "anulado";
  asiento_id: string | null;
  bodega: { codigo: string; nombre: string } | null;
  lineas: { count: number }[];
}

export async function listarAjustes(): Promise<AjusteListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ajustes_inventario")
    .select(
      "id, fecha, motivo, estado, asiento_id, " +
        "bodega:bodegas(codigo, nombre), lineas:ajustes_inventario_lineas(count)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los ajustes: ${error.message}`);

  return ((data ?? []) as unknown as AjusteRowEmbebido[]).map((a) => ({
    id: a.id,
    fecha: a.fecha,
    bodega_codigo: a.bodega?.codigo ?? "",
    bodega_nombre: a.bodega?.nombre ?? "",
    motivo: a.motivo,
    estado: a.estado,
    n_lineas: a.lineas?.[0]?.count ?? 0,
    asiento_id: a.asiento_id,
  }));
}

export interface AjusteLineaDetalle {
  linea: number;
  articulo_codigo: string;
  articulo_nombre: string;
  direccion: "pos" | "neg";
  cantidad: number;
  detalle: string | null;
}

export interface AjusteDetalle {
  id: string;
  fecha: string;
  bodega_codigo: string;
  bodega_nombre: string;
  motivo: string;
  estado: "borrador" | "confirmado" | "anulado";
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: AjusteLineaDetalle[];
}

interface AjusteDetalleEmbebido {
  id: string;
  fecha: string;
  motivo: string;
  estado: "borrador" | "confirmado" | "anulado";
  asiento_id: string | null;
  bodega: { codigo: string; nombre: string } | null;
  asiento: { numero: number | null } | null;
  lineas: {
    linea: number;
    direccion: "pos" | "neg";
    cantidad: number;
    detalle: string | null;
    articulo: { codigo: string; nombre: string } | null;
  }[];
}

export async function obtenerAjuste(id: string): Promise<AjusteDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ajustes_inventario")
    .select(
      "id, fecha, motivo, estado, asiento_id, " +
        "bodega:bodegas(codigo, nombre), asiento:asientos(numero), " +
        "lineas:ajustes_inventario_lineas(linea, direccion, cantidad, detalle, " +
        "articulo:articulos(codigo, nombre))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el ajuste: ${error.message}`);
  }

  const a = data as unknown as AjusteDetalleEmbebido;
  return {
    id: a.id,
    fecha: a.fecha,
    bodega_codigo: a.bodega?.codigo ?? "",
    bodega_nombre: a.bodega?.nombre ?? "",
    motivo: a.motivo,
    estado: a.estado,
    asiento_id: a.asiento_id,
    asiento_numero: a.asiento?.numero ?? null,
    lineas: (a.lineas ?? [])
      .sort((x, y) => x.linea - y.linea)
      .map((l) => ({
        linea: l.linea,
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        direccion: l.direccion,
        cantidad: Number(l.cantidad),
        detalle: l.detalle,
      })),
  };
}

// === TRANSFERENCIAS ========================================================
export type TransferenciaEstado = "borrador" | "en_transito" | "recibida" | "anulada";

export interface TransferenciaListado {
  id: string;
  fecha: string;
  origen_codigo: string;
  destino_codigo: string;
  glosa: string | null;
  estado: TransferenciaEstado;
  n_lineas: number;
}

interface TransfRowEmbebido {
  id: string;
  fecha: string;
  glosa: string | null;
  estado: TransferenciaEstado;
  origen: { codigo: string } | null;
  destino: { codigo: string } | null;
  lineas: { count: number }[];
}

export async function listarTransferencias(): Promise<TransferenciaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transferencias")
    .select(
      "id, fecha, glosa, estado, " +
        "origen:bodegas!transferencias_bodega_origen_id_fkey(codigo), " +
        "destino:bodegas!transferencias_bodega_destino_id_fkey(codigo), " +
        "lineas:transferencias_lineas(count)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las transferencias: ${error.message}`);

  return ((data ?? []) as unknown as TransfRowEmbebido[]).map((t) => ({
    id: t.id,
    fecha: t.fecha,
    origen_codigo: t.origen?.codigo ?? "",
    destino_codigo: t.destino?.codigo ?? "",
    glosa: t.glosa,
    estado: t.estado,
    n_lineas: t.lineas?.[0]?.count ?? 0,
  }));
}

export interface TransferenciaLineaDetalle {
  linea: number;
  articulo_codigo: string;
  articulo_nombre: string;
  cantidad_enviada: number;
  cantidad_recibida: number;
  pendiente: number;
  detalle: string | null;
}

export interface TransferenciaDetalle {
  id: string;
  fecha: string;
  origen_codigo: string;
  origen_nombre: string;
  destino_codigo: string;
  destino_nombre: string;
  glosa: string | null;
  estado: TransferenciaEstado;
  lineas: TransferenciaLineaDetalle[];
}

interface TransfDetalleEmbebido {
  id: string;
  fecha: string;
  glosa: string | null;
  estado: TransferenciaEstado;
  origen: { codigo: string; nombre: string } | null;
  destino: { codigo: string; nombre: string } | null;
  lineas: {
    linea: number;
    cantidad_enviada: number;
    cantidad_recibida: number;
    detalle: string | null;
    articulo: { codigo: string; nombre: string } | null;
  }[];
}

export async function obtenerTransferencia(id: string): Promise<TransferenciaDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transferencias")
    .select(
      "id, fecha, glosa, estado, " +
        "origen:bodegas!transferencias_bodega_origen_id_fkey(codigo, nombre), " +
        "destino:bodegas!transferencias_bodega_destino_id_fkey(codigo, nombre), " +
        "lineas:transferencias_lineas(linea, cantidad_enviada, cantidad_recibida, detalle, " +
        "articulo:articulos(codigo, nombre))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la transferencia: ${error.message}`);
  }

  const t = data as unknown as TransfDetalleEmbebido;
  return {
    id: t.id,
    fecha: t.fecha,
    origen_codigo: t.origen?.codigo ?? "",
    origen_nombre: t.origen?.nombre ?? "",
    destino_codigo: t.destino?.codigo ?? "",
    destino_nombre: t.destino?.nombre ?? "",
    glosa: t.glosa,
    estado: t.estado,
    lineas: (t.lineas ?? [])
      .sort((x, y) => x.linea - y.linea)
      .map((l) => ({
        linea: l.linea,
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        cantidad_enviada: Number(l.cantidad_enviada),
        cantidad_recibida: Number(l.cantidad_recibida),
        pendiente: Number(l.cantidad_enviada) - Number(l.cantidad_recibida),
        detalle: l.detalle,
      })),
  };
}

// === CIERRE DE INVENTARIO (periódico) ======================================
export interface ArticuloParaCierre {
  articulo_id: string;
  codigo: string;
  nombre: string;
  cantidad_teorica: number;
  costo_promedio: number;
}

/** Artículos con existencia en una bodega, con su cantidad teórica y costo. */
export async function articulosParaCierre(bodegaId: string): Promise<ArticuloParaCierre[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("existencias")
    .select("cantidad, articulo:articulos!inner(id, codigo, nombre, estado)")
    .eq("bodega_id", bodegaId)
    .neq("cantidad", 0);
  if (error) throw new Error(`No se pudieron cargar los artículos: ${error.message}`);
  const filas = (data ?? []) as unknown as {
    cantidad: number;
    articulo: { id: string; codigo: string; nombre: string; estado: string } | null;
  }[];
  const ids = filas.map((f) => f.articulo?.id).filter(Boolean) as string[];
  const { data: saldos } = ids.length
    ? await supabase.from("articulos_saldos").select("articulo_id, costo_promedio").in("articulo_id", ids)
    : { data: [] as { articulo_id: string; costo_promedio: number }[] };
  const costo = new Map((saldos ?? []).map((s) => [s.articulo_id, Number(s.costo_promedio)]));
  return filas
    .filter((f) => f.articulo)
    .map((f) => ({
      articulo_id: f.articulo!.id,
      codigo: f.articulo!.codigo,
      nombre: f.articulo!.nombre,
      cantidad_teorica: Number(f.cantidad),
      costo_promedio: costo.get(f.articulo!.id) ?? 0,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export type CierreEstado = "borrador" | "confirmado" | "anulado";

export interface CierreListado {
  id: string;
  fecha: string;
  bodega_codigo: string;
  centro_codigo: string | null;
  valor_teorico: number;
  valor_fisico: number;
  diferencia: number;
  estado: CierreEstado;
}

export async function listarCierres(): Promise<CierreListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cierres_inventario")
    .select(
      "id, fecha, valor_teorico, valor_fisico, diferencia, estado, " +
        "bodega:bodegas(codigo), centro:centros_costo(codigo)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los cierres: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    valor_teorico: number;
    valor_fisico: number;
    diferencia: number;
    estado: CierreEstado;
    bodega: { codigo: string } | null;
    centro: { codigo: string } | null;
  }[]).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    bodega_codigo: c.bodega?.codigo ?? "",
    centro_codigo: c.centro?.codigo ?? null,
    valor_teorico: Number(c.valor_teorico),
    valor_fisico: Number(c.valor_fisico),
    diferencia: Number(c.diferencia),
    estado: c.estado,
  }));
}

export interface CierreLineaDetalle {
  linea: number;
  articulo_codigo: string;
  articulo_nombre: string;
  cantidad_teorica: number;
  cantidad_fisica: number;
  costo_promedio: number;
  valor_teorico: number;
  valor_fisico: number;
}

export interface CierreDetalle {
  id: string;
  fecha: string;
  bodega_codigo: string;
  bodega_nombre: string;
  centro_codigo: string | null;
  estado: CierreEstado;
  valor_teorico: number;
  valor_fisico: number;
  diferencia: number;
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: CierreLineaDetalle[];
}

export async function obtenerCierre(id: string): Promise<CierreDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cierres_inventario")
    .select(
      "id, fecha, valor_teorico, valor_fisico, diferencia, estado, asiento_id, " +
        "bodega:bodegas(codigo, nombre), centro:centros_costo(codigo), asiento:asientos(numero), " +
        "lineas:cierres_inventario_lineas(linea, cantidad_teorica, cantidad_fisica, costo_promedio, " +
        "valor_teorico, valor_fisico, articulo:articulos(codigo, nombre))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el cierre: ${error.message}`);
  }
  const c = data as unknown as {
    id: string;
    fecha: string;
    valor_teorico: number;
    valor_fisico: number;
    diferencia: number;
    estado: CierreEstado;
    asiento_id: string | null;
    bodega: { codigo: string; nombre: string } | null;
    centro: { codigo: string } | null;
    asiento: { numero: number | null } | null;
    lineas: {
      linea: number;
      cantidad_teorica: number;
      cantidad_fisica: number;
      costo_promedio: number;
      valor_teorico: number;
      valor_fisico: number;
      articulo: { codigo: string; nombre: string } | null;
    }[];
  };
  return {
    id: c.id,
    fecha: c.fecha,
    bodega_codigo: c.bodega?.codigo ?? "",
    bodega_nombre: c.bodega?.nombre ?? "",
    centro_codigo: c.centro?.codigo ?? null,
    estado: c.estado,
    valor_teorico: Number(c.valor_teorico),
    valor_fisico: Number(c.valor_fisico),
    diferencia: Number(c.diferencia),
    asiento_id: c.asiento_id,
    asiento_numero: c.asiento?.numero ?? null,
    lineas: (c.lineas ?? [])
      .sort((a, b) => a.linea - b.linea)
      .map((l) => ({
        linea: l.linea,
        articulo_codigo: l.articulo?.codigo ?? "",
        articulo_nombre: l.articulo?.nombre ?? "",
        cantidad_teorica: Number(l.cantidad_teorica),
        cantidad_fisica: Number(l.cantidad_fisica),
        costo_promedio: Number(l.costo_promedio),
        valor_teorico: Number(l.valor_teorico),
        valor_fisico: Number(l.valor_fisico),
      })),
  };
}

// === Desechos de producto terminado ========================================
export type DesechoEstado = "borrador" | "confirmado" | "anulado";
export type DesechoMotivo = "danado" | "vencido" | "otro";

export const motivoDesechoLabel: Record<DesechoMotivo, string> = {
  danado: "Dañado",
  vencido: "Vencido",
  otro: "Otro",
};

export interface DesechoListado {
  id: string;
  fecha: string;
  centro_codigo: string | null;
  centro_nombre: string | null;
  motivo: DesechoMotivo;
  valor_total: number;
  estado: DesechoEstado;
}

export async function listarDesechos(): Promise<DesechoListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("desechos_pt")
    .select("id, fecha, motivo, valor_total, estado, centro:centros_costo(codigo, nombre)")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los desechos: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    motivo: DesechoMotivo;
    valor_total: number;
    estado: DesechoEstado;
    centro: { codigo: string; nombre: string } | null;
  }[]).map((d) => ({
    id: d.id,
    fecha: d.fecha,
    centro_codigo: d.centro?.codigo ?? null,
    centro_nombre: d.centro?.nombre ?? null,
    motivo: d.motivo,
    valor_total: Number(d.valor_total),
    estado: d.estado,
  }));
}

export interface DesechoLineaDetalle {
  linea: number;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  valor: number;
}

export interface DesechoDetalle {
  id: string;
  fecha: string;
  centro_codigo: string | null;
  centro_nombre: string | null;
  motivo: DesechoMotivo;
  glosa: string | null;
  estado: DesechoEstado;
  valor_total: number;
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: DesechoLineaDetalle[];
}

export async function obtenerDesecho(id: string): Promise<DesechoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("desechos_pt")
    .select(
      "id, fecha, motivo, glosa, estado, valor_total, asiento_id, " +
        "centro:centros_costo(codigo, nombre), asiento:asientos(numero), " +
        "lineas:desechos_pt_lineas(linea, descripcion, cantidad, costo_unitario, valor)",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el desecho: ${error.message}`);
  }
  const d = data as unknown as {
    id: string;
    fecha: string;
    motivo: DesechoMotivo;
    glosa: string | null;
    estado: DesechoEstado;
    valor_total: number;
    asiento_id: string | null;
    centro: { codigo: string; nombre: string } | null;
    asiento: { numero: number | null } | null;
    lineas: {
      linea: number;
      descripcion: string;
      cantidad: number;
      costo_unitario: number;
      valor: number;
    }[];
  };
  return {
    id: d.id,
    fecha: d.fecha,
    centro_codigo: d.centro?.codigo ?? null,
    centro_nombre: d.centro?.nombre ?? null,
    motivo: d.motivo,
    glosa: d.glosa,
    estado: d.estado,
    valor_total: Number(d.valor_total),
    asiento_id: d.asiento_id,
    asiento_numero: d.asiento?.numero ?? null,
    lineas: (d.lineas ?? [])
      .sort((a, b) => a.linea - b.linea)
      .map((l) => ({
        linea: l.linea,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
        valor: Number(l.valor),
      })),
  };
}

export interface TransitoFila {
  transferencia_id: string;
  fecha: string;
  origen: string;
  destino: string;
  articulo_codigo: string;
  articulo_nombre: string;
  en_transito: number;
}

export async function inventarioTransito(): Promise<TransitoFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_inventario_transito")
    .select("transferencia_id, fecha, origen, destino, articulo_codigo, articulo_nombre, en_transito")
    .order("fecha", { ascending: false });
  if (error) throw new Error(`No se pudo cargar el inventario en tránsito: ${error.message}`);
  return (data ?? []).map((f) => ({ ...f, en_transito: Number(f.en_transito) }));
}
