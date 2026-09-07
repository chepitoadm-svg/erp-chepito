// Capa de datos del módulo de Cierre mensual (lecturas, sujetas a RLS).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CierreMes {
  id: string;
  anio: number;
  mes: number;
  estado: "en_proceso" | "cerrado";
  total: number;
  listos: number;
  pendientes: number;
}

export interface CierreItem {
  item_id: string;
  requisito_id: string;
  codigo: string;
  nombre: string;
  grupo: string;
  orden: number;
  alcance: "global" | "centro" | "cuenta_banco";
  auto_fuente: "ventas" | "compras" | "planilla" | "conciliacion" | "retiros_caja" | "retiros_dep" | "salidas_vext" | null;
  requiere_archivo: boolean;
  centro_id: string | null;
  centro_codigo: string | null;
  cuenta_id: string | null;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  estado_manual: "pendiente" | "listo" | "na";
  nota: string | null;
  auto_listo: boolean | null;
  auto_n: number | null;
  auto_monto: number | null;
  auto_detalle: string | null;
  estado_efectivo: "pendiente" | "listo" | "na";
  n_archivos: number;
}

export interface Requisito {
  id: string;
  codigo: string;
  nombre: string;
  grupo: string;
  alcance: "global" | "centro" | "cuenta_banco";
  auto_fuente: string | null;
  centros: string[] | null;
  requiere_archivo: boolean;
  orden: number;
  activo: boolean;
}

export interface ArchivoItem {
  id: string;
  nombre: string;
  tamano: number | null;
  mime: string | null;
  path: string;
  subido_en: string;
}

export async function listarCierres(): Promise<CierreMes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_cierres");
  if (error) throw new Error(`No se pudieron cargar los cierres: ${error.message}`);
  return (data ?? []).map((c: CierreMes) => ({
    ...c,
    total: Number(c.total),
    listos: Number(c.listos),
    pendientes: Number(c.pendientes),
  }));
}

export async function detalleCierre(anio: number, mes: number): Promise<CierreItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_cierre_detalle", { p_anio: anio, p_mes: mes });
  if (error) throw new Error(`No se pudo cargar el cierre: ${error.message}`);
  return (data ?? []) as CierreItem[];
}

export async function archivosDeItem(itemId: string): Promise<ArchivoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_archivos_item", { p_item: itemId });
  if (error) throw new Error(`No se pudieron cargar los archivos: ${error.message}`);
  return (data ?? []) as ArchivoItem[];
}

export async function listarRequisitos(): Promise<Requisito[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_requisitos");
  if (error) throw new Error(`No se pudieron cargar los requisitos: ${error.message}`);
  return (data ?? []) as Requisito[];
}

export interface RetiroCaja {
  id: string;
  fecha: string;
  control_caja: string | null;
  monto: number;
  motivo: string | null;
  cajero: string | null;
  caja: string | null;
  estado: "pendiente" | "ingresado" | "na";
  mov_tipo: "gasto" | "pago" | "planilla" | null;
  mov_desc: string | null;
  asiento_id: string | null;
  asiento_numero: number | null;
  sug_gasto_id: string | null;
  sug_fecha: string | null;
  sug_desc: string | null;
  sug_dif_dias: number | null;
}

export interface CxpPendiente {
  id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  fecha: string;
  vence: string | null;
  consecutivo: string | null;
  saldo: number;
}

export interface PlanillaPendiente {
  id: string;
  titulo: string;
  fecha: string;
  neto: number;
  pagado: number;
  saldo: number;
}

export async function planillasPendientes(): Promise<PlanillaPendiente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_planillas_pendientes");
  if (error) throw new Error(`No se pudieron cargar las planillas: ${error.message}`);
  return (data ?? []).map((r: PlanillaPendiente) => ({
    ...r,
    neto: Number(r.neto),
    pagado: Number(r.pagado),
    saldo: Number(r.saldo),
  }));
}

export async function cxpPendientes(): Promise<CxpPendiente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_cxp_pendientes");
  if (error) throw new Error(`No se pudieron cargar las facturas por pagar: ${error.message}`);
  return (data ?? []).map((r: CxpPendiente) => ({ ...r, saldo: Number(r.saldo) }));
}

export async function listarRetiros(centroId: string, anio: number, mes: number): Promise<RetiroCaja[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_retiros", {
    p_centro: centroId,
    p_anio: anio,
    p_mes: mes,
  });
  if (error) throw new Error(`No se pudieron cargar los retiros: ${error.message}`);
  return (data ?? []).map((r: RetiroCaja) => ({ ...r, monto: Number(r.monto) }));
}

export async function listarRetirosDep(anio: number, mes: number): Promise<RetiroCaja[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_retiros_dep", { p_anio: anio, p_mes: mes });
  if (error) throw new Error(`No se pudieron cargar los retiros: ${error.message}`);
  return (data ?? []).map((r: RetiroCaja) => ({ ...r, monto: Number(r.monto) }));
}

export async function listarRetirosExt(anio: number, mes: number): Promise<RetiroCaja[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_retiros_ext", { p_anio: anio, p_mes: mes });
  if (error) throw new Error(`No se pudieron cargar las salidas: ${error.message}`);
  return (data ?? []).map((r: RetiroCaja) => ({ ...r, monto: Number(r.monto) }));
}
