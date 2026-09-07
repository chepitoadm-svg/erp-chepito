// Capa de datos del control de ventas externas / mayoreo (lecturas, RLS).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ClienteExt {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface CeldaVentaExt {
  cliente_id: string;
  dia: number;
  monto: number;
}

export async function listarClientesExt(): Promise<ClienteExt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_clientes_ext");
  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
  return (data ?? []) as ClienteExt[];
}

export async function ventasExtMes(anio: number, mes: number): Promise<CeldaVentaExt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_ventas_ext_mes", { p_anio: anio, p_mes: mes });
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return (data ?? []).map((r: CeldaVentaExt) => ({ ...r, dia: Number(r.dia), monto: Number(r.monto) }));
}

export interface SalidaExt {
  id: string;
  fecha: string;
  descripcion: string | null;
  monto: number;
}

export async function salidasExtMes(anio: number, mes: number): Promise<SalidaExt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_salidas_ext_mes", { p_anio: anio, p_mes: mes });
  if (error) throw new Error(`No se pudieron cargar las salidas: ${error.message}`);
  return (data ?? []).map((r: SalidaExt) => ({ ...r, monto: Number(r.monto) }));
}

export interface VentaVex {
  id: string;
  fecha: string;
  total: number;
  estado: "borrador" | "confirmado" | "anulado";
  asiento_id: string | null;
  asiento_numero: number | null;
}

/** Ventas del día del centro VEX (venta externa) posteadas ese mes, con su asiento. */
export async function ventasVexMes(anio: number, mes: number): Promise<VentaVex[]> {
  const supabase = await createClient();
  const { data: cen } = await supabase.from("centros_costo").select("id").eq("codigo", "VEX").single();
  if (!cen) return [];
  const mm = String(mes).padStart(2, "0");
  const ini = `${anio}-${mm}-01`;
  const fin = `${anio}-${mm}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("ventas_dia")
    .select("id, fecha, total, estado, asiento_id, asiento:asientos(numero)")
    .eq("centro_costo_id", cen.id)
    .gte("fecha", ini)
    .lte("fecha", fin)
    .order("fecha");
  if (error) throw new Error(`No se pudieron cargar las ventas VEX: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    total: number;
    estado: "borrador" | "confirmado" | "anulado";
    asiento_id: string | null;
    asiento: { numero: number | null } | { numero: number | null }[] | null;
  }[]).map((v) => {
    const a = v.asiento ? (Array.isArray(v.asiento) ? v.asiento[0] : v.asiento) : null;
    return {
      id: v.id,
      fecha: v.fecha,
      total: Number(v.total),
      estado: v.estado,
      asiento_id: v.asiento_id,
      asiento_numero: a?.numero ?? null,
    };
  });
}
