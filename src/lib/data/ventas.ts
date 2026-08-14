// Capa de datos de VENTAS (ventas del día por panadería). Corre en el servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type VentaEstado = "borrador" | "confirmado" | "anulado";

export interface VentaDiaListado {
  id: string;
  fecha: string;
  centro_codigo: string | null;
  centro_nombre: string | null;
  gravado: number;
  exento: number;
  iva: number;
  total: number;
  estado: VentaEstado;
}

export async function listarVentasDia(): Promise<VentaDiaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_dia")
    .select("id, fecha, gravado, exento, iva, total, estado, centro:centros_costo(codigo, nombre)")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    gravado: number;
    exento: number;
    iva: number;
    total: number;
    estado: VentaEstado;
    centro: { codigo: string; nombre: string } | null;
  }[]).map((v) => ({
    id: v.id,
    fecha: v.fecha,
    centro_codigo: v.centro?.codigo ?? null,
    centro_nombre: v.centro?.nombre ?? null,
    gravado: Number(v.gravado),
    exento: Number(v.exento),
    iva: Number(v.iva),
    total: Number(v.total),
    estado: v.estado,
  }));
}

export interface VentaDiaDetalle extends VentaDiaListado {
  glosa: string | null;
  asiento_id: string | null;
  asiento_numero: number | null;
}

export async function obtenerVentaDia(id: string): Promise<VentaDiaDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_dia")
    .select(
      "id, fecha, gravado, exento, iva, total, estado, glosa, asiento_id, " +
        "centro:centros_costo(codigo, nombre), asiento:asientos(numero)",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la venta: ${error.message}`);
  }
  const v = data as unknown as {
    id: string;
    fecha: string;
    gravado: number;
    exento: number;
    iva: number;
    total: number;
    estado: VentaEstado;
    glosa: string | null;
    asiento_id: string | null;
    centro: { codigo: string; nombre: string } | null;
    asiento: { numero: number | null } | null;
  };
  return {
    id: v.id,
    fecha: v.fecha,
    centro_codigo: v.centro?.codigo ?? null,
    centro_nombre: v.centro?.nombre ?? null,
    gravado: Number(v.gravado),
    exento: Number(v.exento),
    iva: Number(v.iva),
    total: Number(v.total),
    estado: v.estado,
    glosa: v.glosa,
    asiento_id: v.asiento_id,
    asiento_numero: v.asiento?.numero ?? null,
  };
}
