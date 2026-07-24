// Capa de datos de REPORTES contables (solo lecturas). Corre en el servidor
// con RLS. Todas las funciones subyacentes ya filtran estado = 'confirmado'.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function balanza(hasta: string, incluirProrrateo = true) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_balanza", {
    p_hasta: hasta,
    p_incluir_prorrateo: incluirProrrateo,
  });
  if (error) throw new Error(`No se pudo cargar la balanza: ${error.message}`);
  return data ?? [];
}

export async function balanceSituacion(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_balance_situacion", { p_fecha: fecha });
  if (error) throw new Error(`No se pudo cargar el balance: ${error.message}`);
  return data ?? [];
}

export async function estadoResultados(desde: string, hasta: string, incluirProrrateo = true) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estado_resultados", {
    p_desde: desde,
    p_hasta: hasta,
    p_incluir_prorrateo: incluirProrrateo,
  });
  if (error) throw new Error(`No se pudo cargar el estado de resultados: ${error.message}`);
  return data ?? [];
}

export async function mayorCuenta(cuentaId: string, desde?: string, hasta?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_mayor_cuenta", {
    p_cuenta_id: cuentaId,
    p_desde: desde ?? null,
    p_hasta: hasta ?? null,
  });
  if (error) throw new Error(`No se pudo cargar el mayor: ${error.message}`);
  return data ?? [];
}
