// Capa de datos de RECETAS / COSTOS (Fase 4-1). Corre en el servidor.
// Insumos (artículo del inventario o insumo manual) → recetas intermedias →
// productos finales. El costo lo calcula la base (fn_costo_receta) y se lee por
// la vista v_recetas.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface RecetaListado {
  id: string;
  nombre: string;
  es_producto: boolean;
  clasificacion: string | null;
  rinde_cantidad: number | null;
  rinde_unidad: string | null;
  precio_venta: number | null;
  costo: number;
  margen: number | null;
  margen_pct: number | null;
  estado: string;
}

export async function listarRecetas(): Promise<RecetaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_recetas")
    .select(
      "id, nombre, es_producto, clasificacion, rinde_cantidad, rinde_unidad, precio_venta, costo, margen, margen_pct, estado",
    )
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar las recetas: ${error.message}`);
  const n = (x: unknown): number | null => (x == null ? null : Number(x));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    es_producto: r.es_producto as boolean,
    clasificacion: (r.clasificacion as string | null) ?? null,
    rinde_cantidad: n(r.rinde_cantidad),
    rinde_unidad: (r.rinde_unidad as string | null) ?? null,
    precio_venta: n(r.precio_venta),
    costo: Number(r.costo ?? 0),
    margen: n(r.margen),
    margen_pct: n(r.margen_pct),
    estado: r.estado as string,
  }));
}

export interface InsumoManual {
  id: string;
  nombre: string;
  costo_compra: number;
  cantidad_compra: number;
  unidad: string;
  proveedor: string | null;
  estado: string;
}

export async function listarInsumosManuales(): Promise<InsumoManual[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos_manuales")
    .select("id, nombre, costo_compra, cantidad_compra, unidad, proveedor, estado")
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar los insumos: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    costo_compra: Number(r.costo_compra ?? 0),
    cantidad_compra: Number(r.cantidad_compra ?? 0),
    unidad: r.unidad as string,
    proveedor: (r.proveedor as string | null) ?? null,
    estado: r.estado as string,
  }));
}

export async function obtenerInsumoManual(id: string): Promise<InsumoManual | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos_manuales")
    .select("id, nombre, costo_compra, cantidad_compra, unidad, proveedor, estado")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el insumo: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    costo_compra: Number(r.costo_compra ?? 0),
    cantidad_compra: Number(r.cantidad_compra ?? 0),
    unidad: r.unidad as string,
    proveedor: (r.proveedor as string | null) ?? null,
    estado: r.estado as string,
  };
}

// === Receta/producto para el editor ========================================
export interface RecetaLineaEdit {
  tipo_ref: "articulo" | "insumo_manual" | "receta";
  ref_id: string;
  cantidad: number;
  unidad: string;
}
export interface RecetaEdit {
  id: string;
  nombre: string;
  es_producto: boolean;
  clasificacion: string | null;
  rinde_cantidad: number | null;
  rinde_unidad: string | null;
  precio_venta: number | null;
  estado: string;
  lineas: RecetaLineaEdit[];
}

export async function obtenerReceta(id: string): Promise<RecetaEdit | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("recetas")
    .select("id, nombre, es_producto, clasificacion, rinde_cantidad, rinde_unidad, precio_venta, estado")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la receta: ${error.message}`);
  if (!r) return null;

  const { data: ls, error: e2 } = await supabase
    .from("recetas_lineas")
    .select("linea, tipo_ref, articulo_id, insumo_manual_id, receta_ref_id, cantidad, unidad")
    .eq("receta_id", id)
    .order("linea");
  if (e2) throw new Error(`No se pudieron cargar las líneas: ${e2.message}`);

  const lineas: RecetaLineaEdit[] = (ls ?? []).map((l) => {
    const tipo = l.tipo_ref as RecetaLineaEdit["tipo_ref"];
    const ref =
      tipo === "articulo" ? l.articulo_id : tipo === "insumo_manual" ? l.insumo_manual_id : l.receta_ref_id;
    return { tipo_ref: tipo, ref_id: (ref ?? "") as string, cantidad: Number(l.cantidad), unidad: l.unidad as string };
  });

  return {
    id: r.id as string,
    nombre: r.nombre as string,
    es_producto: r.es_producto as boolean,
    clasificacion: (r.clasificacion as string | null) ?? null,
    rinde_cantidad: r.rinde_cantidad == null ? null : Number(r.rinde_cantidad),
    rinde_unidad: (r.rinde_unidad as string | null) ?? null,
    precio_venta: r.precio_venta == null ? null : Number(r.precio_venta),
    estado: r.estado as string,
    lineas,
  };
}

// === Fuentes para las líneas (artículo de inventario | insumo manual | receta)
export interface FuenteReceta {
  key: string; // "articulo:<id>" | "insumo_manual:<id>" | "receta:<id>"
  tipo: "articulo" | "insumo_manual" | "receta";
  ref_id: string;
  nombre: string;
  unidad_natural: string; // unidad sugerida al elegir esta fuente
  cpb: number; // costo por unidad base (₡ por g / ml / unidad)
}

const FBASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, L: 1000, unidad: 1, porcion: 1 };
const baseDe = (cant: number, u: string) => (cant || 0) * (FBASE[u] ?? 1);
const FACT_ART: Record<string, number> = { G: 1, KG: 1000, ML: 1, L: 1000, UN: 1, UNIDAD: 1 };

export async function listarFuentesReceta(excluirRecetaId?: string): Promise<FuenteReceta[]> {
  const supabase = await createClient();
  const [arts, unis, saldos, insumos, recs] = await Promise.all([
    supabase.from("articulos").select("id, nombre, unidad_stock_id, estado").eq("estado", "activo"),
    supabase.from("unidades").select("id, codigo"),
    supabase.from("articulos_saldos").select("articulo_id, costo_promedio"),
    supabase
      .from("insumos_manuales")
      .select("id, nombre, costo_compra, cantidad_compra, unidad, estado")
      .eq("estado", "activo"),
    supabase
      .from("v_recetas")
      .select("id, nombre, rinde_cantidad, rinde_unidad, costo, es_producto, estado")
      .eq("es_producto", false)
      .eq("estado", "activo"),
  ]);
  const err = arts.error || unis.error || saldos.error || insumos.error || recs.error;
  if (err) throw new Error(`No se pudieron cargar las fuentes: ${err.message}`);

  const uniCode = new Map((unis.data ?? []).map((u) => [u.id as string, (u.codigo as string) ?? ""]));
  const costoArt = new Map((saldos.data ?? []).map((s) => [s.articulo_id as string, Number(s.costo_promedio) || 0]));
  const out: FuenteReceta[] = [];

  for (const a of arts.data ?? []) {
    const code = (uniCode.get(a.unidad_stock_id as string) || "").toUpperCase();
    const fact = FACT_ART[code];
    if (fact == null) continue; // unidad tipo SACO/CJ/BOT: no sirve directo en receta
    const cpb = (costoArt.get(a.id as string) || 0) / fact;
    const uNat = code === "KG" || code === "G" ? "g" : code === "L" || code === "ML" ? "ml" : "unidad";
    out.push({ key: `articulo:${a.id}`, tipo: "articulo", ref_id: a.id as string, nombre: `${a.nombre} (inventario)`, unidad_natural: uNat, cpb });
  }
  for (const i of insumos.data ?? []) {
    const b = baseDe(Number(i.cantidad_compra), i.unidad as string);
    out.push({
      key: `insumo_manual:${i.id}`, tipo: "insumo_manual", ref_id: i.id as string,
      nombre: `${i.nombre}`, unidad_natural: i.unidad as string, cpb: b > 0 ? Number(i.costo_compra) / b : 0,
    });
  }
  for (const r of recs.data ?? []) {
    if (excluirRecetaId && (r.id as string) === excluirRecetaId) continue;
    const b = baseDe(Number(r.rinde_cantidad), r.rinde_unidad as string);
    out.push({
      key: `receta:${r.id}`, tipo: "receta", ref_id: r.id as string,
      nombre: `${r.nombre} (receta)`, unidad_natural: (r.rinde_unidad as string) || "g", cpb: b > 0 ? Number(r.costo) / b : 0,
    });
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return out;
}
