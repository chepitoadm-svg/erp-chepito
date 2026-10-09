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
