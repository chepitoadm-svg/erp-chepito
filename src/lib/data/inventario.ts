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

/** Artículos inventariables (para el selector del kardex). */
export async function listarArticulosParaSelector() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articulos")
    .select("id, codigo, nombre")
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
