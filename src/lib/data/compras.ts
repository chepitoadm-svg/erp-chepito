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
