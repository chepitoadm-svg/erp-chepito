// Capa de datos del historial de DESECHO (snapshots guardados por mes). Servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface DesechoMesListado {
  id: string;
  periodo: string; // YYYY-MM-DD (primer día)
  centro_codigo: string | null;
  centro_nombre: string | null;
  bodega: string | null;
  compras_total: number;
  merma: number;
  autoconsumo: number;
  costo_vendido: number;
  posteado: boolean;
}

export async function listarDesechoMeses(): Promise<DesechoMesListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("desecho_mes")
    .select(
      "id, periodo, bodega, compras_total, merma, autoconsumo, costo_vendido, posteado, " +
        "centro:centros_costo(codigo, nombre)",
    )
    .order("periodo", { ascending: false });
  if (error) throw new Error(`No se pudo cargar el historial de desecho: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    periodo: string;
    bodega: string | null;
    compras_total: number;
    merma: number;
    autoconsumo: number;
    costo_vendido: number;
    posteado: boolean;
    centro: { codigo: string; nombre: string } | null;
  }[]).map((r) => ({
    id: r.id,
    periodo: r.periodo,
    centro_codigo: r.centro?.codigo ?? null,
    centro_nombre: r.centro?.nombre ?? null,
    bodega: r.bodega,
    compras_total: Number(r.compras_total),
    merma: Number(r.merma),
    autoconsumo: Number(r.autoconsumo),
    costo_vendido: Number(r.costo_vendido),
    posteado: r.posteado,
  }));
}

export interface DesechoLinea {
  codigo: string;
  nombre: string | null;
  tipo_mov: string | null;
  clase: "merma" | "autoconsumo" | "ignorar";
  cantidad: number;
  costo_unitario: number | null;
  costo_total: number | null;
}

export interface DesechoMesDetalle extends DesechoMesListado {
  lineas: DesechoLinea[];
}

export async function obtenerDesechoMes(id: string): Promise<DesechoMesDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("desecho_mes")
    .select(
      "id, periodo, bodega, compras_total, merma, autoconsumo, costo_vendido, posteado, " +
        "centro:centros_costo(codigo, nombre), " +
        "lineas:desecho_detalle(codigo, nombre, tipo_mov, clase, cantidad, costo_unitario, costo_total)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el desecho: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as {
    id: string;
    periodo: string;
    bodega: string | null;
    compras_total: number;
    merma: number;
    autoconsumo: number;
    costo_vendido: number;
    posteado: boolean;
    centro: { codigo: string; nombre: string } | null;
    lineas: {
      codigo: string;
      nombre: string | null;
      tipo_mov: string | null;
      clase: "merma" | "autoconsumo" | "ignorar";
      cantidad: number;
      costo_unitario: number | null;
      costo_total: number | null;
    }[];
  };
  return {
    id: r.id,
    periodo: r.periodo,
    centro_codigo: r.centro?.codigo ?? null,
    centro_nombre: r.centro?.nombre ?? null,
    bodega: r.bodega,
    compras_total: Number(r.compras_total),
    merma: Number(r.merma),
    autoconsumo: Number(r.autoconsumo),
    costo_vendido: Number(r.costo_vendido),
    posteado: r.posteado,
    lineas: (r.lineas ?? []).map((l) => ({
      codigo: l.codigo,
      nombre: l.nombre,
      tipo_mov: l.tipo_mov,
      clase: l.clase,
      cantidad: Number(l.cantidad),
      costo_unitario: l.costo_unitario == null ? null : Number(l.costo_unitario),
      costo_total: l.costo_total == null ? null : Number(l.costo_total),
    })),
  };
}
