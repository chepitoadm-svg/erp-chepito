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

export interface FlujoLinea {
  cuenta_codigo: string;
  cuenta_nombre: string;
  monto: number;
}
export interface FlujoCategoria {
  categoria: string;
  total: number;
  lineas: FlujoLinea[];
}
export interface FlujoCaja {
  saldo_inicial: number;
  saldo_final: number;
  total_entradas: number;
  total_salidas: number; // positivo (magnitud)
  entradas: FlujoCategoria[];
  salidas: FlujoCategoria[];
}

// Flujo de caja del periodo (método directo). Agrupa por categoría; entradas y
// salidas separadas y ordenadas por magnitud (dónde se va la plata primero).
export async function flujoCaja(desde: string, hasta: string): Promise<FlujoCaja> {
  const supabase = await createClient();
  const diaAntes = new Date(desde + "T00:00:00");
  diaAntes.setDate(diaAntes.getDate() - 1);
  const antes = diaAntes.toISOString().slice(0, 10);

  const [ini, fin, mov] = await Promise.all([
    supabase.rpc("fn_saldo_caja", { p_fecha: antes }),
    supabase.rpc("fn_saldo_caja", { p_fecha: hasta }),
    supabase.rpc("fn_flujo_caja", { p_desde: desde, p_hasta: hasta }),
  ]);
  if (mov.error) throw new Error(`No se pudo cargar el flujo de caja: ${mov.error.message}`);

  const filas = (mov.data ?? []) as {
    categoria: string;
    tipo: "entrada" | "salida";
    cuenta_codigo: string;
    cuenta_nombre: string;
    monto: number;
  }[];

  const agrupar = (tipo: "entrada" | "salida"): FlujoCategoria[] => {
    const m = new Map<string, FlujoCategoria>();
    for (const f of filas.filter((x) => x.tipo === tipo)) {
      const e = m.get(f.categoria) ?? { categoria: f.categoria, total: 0, lineas: [] };
      const monto = Math.abs(Number(f.monto));
      e.total += monto;
      e.lineas.push({ cuenta_codigo: f.cuenta_codigo, cuenta_nombre: f.cuenta_nombre, monto });
      m.set(f.categoria, e);
    }
    const cats = [...m.values()].sort((a, b) => b.total - a.total);
    cats.forEach((c) => c.lineas.sort((a, b) => b.monto - a.monto));
    return cats;
  };

  const entradas = agrupar("entrada");
  const salidas = agrupar("salida");
  return {
    saldo_inicial: Number(ini.data ?? 0),
    saldo_final: Number(fin.data ?? 0),
    total_entradas: entradas.reduce((s, c) => s + c.total, 0),
    total_salidas: salidas.reduce((s, c) => s + c.total, 0),
    entradas,
    salidas,
  };
}

export interface CompromisoCategoria {
  categoria: string;
  total: number;
  lineas: { cuenta_codigo: string; cuenta_nombre: string; saldo: number }[];
}
export interface Compromisos {
  disponible: number; // caja + banco a la fecha
  total_debo: number; // total pasivos
  neto: number; // disponible - total_debo (lo que quedaría al pagar todo)
  categorias: CompromisoCategoria[];
}

// Lo que se debe a una fecha (pasivos) vs lo disponible en caja+banco.
export async function compromisos(fecha: string): Promise<Compromisos> {
  const supabase = await createClient();
  const [caja, deb] = await Promise.all([
    supabase.rpc("fn_saldo_caja", { p_fecha: fecha }),
    supabase.rpc("fn_compromisos", { p_fecha: fecha }),
  ]);
  if (deb.error) throw new Error(`No se pudieron cargar los compromisos: ${deb.error.message}`);
  const filas = (deb.data ?? []) as { categoria: string; cuenta_codigo: string; cuenta_nombre: string; saldo: number }[];

  const m = new Map<string, CompromisoCategoria>();
  for (const f of filas) {
    const e = m.get(f.categoria) ?? { categoria: f.categoria, total: 0, lineas: [] };
    e.total += Number(f.saldo);
    e.lineas.push({ cuenta_codigo: f.cuenta_codigo, cuenta_nombre: f.cuenta_nombre, saldo: Number(f.saldo) });
    m.set(f.categoria, e);
  }
  const categorias = [...m.values()].sort((a, b) => b.total - a.total);
  categorias.forEach((c) => c.lineas.sort((a, b) => b.saldo - a.saldo));
  const disponible = Number(caja.data ?? 0);
  const total_debo = categorias.reduce((s, c) => s + c.total, 0);
  return { disponible, total_debo, neto: disponible - total_debo, categorias };
}

export interface DetalleBancarioLinea {
  fecha: string;
  referencia: string | null;
  descripcion: string | null;
  monto: number;
  conciliado: boolean;
  origen_tipo: string | null;
  origen_id: string | null;
  asiento_id: string;
}
export interface DetalleBancarioCentro {
  centro: string;
  total: number;
  lineas: DetalleBancarioLinea[];
}
// Detalle bancario de una cuenta agrupado por centro de costo: las líneas reales
// del estado de cuenta (o el movimiento si no está conciliado).
export async function detalleBancarioCuenta(cuentaId: string, desde: string, hasta: string): Promise<DetalleBancarioCentro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_detalle_bancario_cuenta", {
    p_cuenta: cuentaId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(`No se pudo cargar el detalle bancario: ${error.message}`);
  const filas = (data ?? []) as {
    centro_codigo: string;
    fecha: string;
    referencia: string | null;
    descripcion: string | null;
    monto: number;
    conciliado: boolean;
    origen_tipo: string | null;
    origen_id: string | null;
    asiento_id: string;
  }[];
  const m = new Map<string, DetalleBancarioCentro>();
  for (const f of filas) {
    const e = m.get(f.centro_codigo) ?? { centro: f.centro_codigo, total: 0, lineas: [] };
    e.total += Number(f.monto);
    e.lineas.push({
      fecha: f.fecha,
      referencia: f.referencia,
      descripcion: f.descripcion,
      monto: Number(f.monto),
      conciliado: f.conciliado,
      origen_tipo: f.origen_tipo,
      origen_id: f.origen_id,
      asiento_id: f.asiento_id,
    });
    m.set(f.centro_codigo, e);
  }
  return [...m.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export async function mayorCuenta(
  cuentaId: string,
  desde?: string,
  hasta?: string,
  excluirProrrateo = false,
  excluirAnulados = false,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_mayor_cuenta", {
    p_cuenta_id: cuentaId,
    p_desde: desde ?? null,
    p_hasta: hasta ?? null,
    p_excluir_prorrateo: excluirProrrateo,
    p_excluir_anulados: excluirAnulados,
  });
  if (error) throw new Error(`No se pudo cargar el mayor: ${error.message}`);
  return data ?? [];
}
