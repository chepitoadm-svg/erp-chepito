// Capa de datos de REPORTES contables (solo lecturas). Corre en el servidor
// con RLS. Todas las funciones subyacentes ya filtran estado = 'confirmado'.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { detectarProveedor } from "@/lib/bancoAlias";
import { obtenerMapaAlias } from "@/lib/data/proveedorAlias";

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
  total_salidas: number; // positivo (magnitud), SIN el datafono
  entradas: FlujoCategoria[];
  salidas: FlujoCategoria[];
  // Movimiento del datafono en el mes (tarjetas cobradas − depósitos recibidos).
  // Negativo = tarjetas que aún NO están en el banco (pendientes de depósito).
  // Se muestra aparte porque no es un gasto: es plata en camino.
  tarjetas_neto: number;
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

  // El datafono (tarjetas por cobrar, 11-30-02%) se saca del flujo normal: no es
  // ni entrada de caja ni gasto, es plata que el banco aún no deposita. Se
  // reporta aparte. `monto` viene firmado (crédito−débito): venta con tarjeta =
  // débito (negativo, pendiente); depósito del banco = crédito (positivo, cobrado).
  const esDatafono = (cod: string) => cod.startsWith("11-30-02");
  const tarjetasNeto = filas.filter((f) => esDatafono(f.cuenta_codigo)).reduce((s, f) => s + Number(f.monto), 0);
  const filasSinDatafono = filas.filter((f) => !esDatafono(f.cuenta_codigo));

  const agrupar = (tipo: "entrada" | "salida"): FlujoCategoria[] => {
    const m = new Map<string, FlujoCategoria>();
    for (const f of filasSinDatafono.filter((x) => x.tipo === tipo)) {
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
    tarjetas_neto: Math.round(tarjetasNeto * 100) / 100,
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

// --- Cuadre: auxiliar de Gastos vs Mayor -------------------------------------
export interface CuadreGastoFila {
  cuenta_codigo: string;
  cuenta_nombre: string;
  cuenta_id: string;
  auxiliar: number;
  mayor: number;
  diferencia: number;
}

export async function cuadreGastos(desde: string, hasta: string): Promise<CuadreGastoFila[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cuadre_gastos", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(`No se pudo cargar el cuadre: ${error.message}`);
  return ((data ?? []) as CuadreGastoFila[]).map((f) => ({
    cuenta_codigo: f.cuenta_codigo,
    cuenta_nombre: f.cuenta_nombre,
    cuenta_id: f.cuenta_id,
    auxiliar: Number(f.auxiliar),
    mayor: Number(f.mayor),
    diferencia: Number(f.diferencia),
  }));
}

// --- Detalle del flujo de caja por cuenta (solo lo que tocó banco) -----------
const TIPO_LABEL: Record<string, string> = {
  factura_compra: "Factura de compra",
  pago_proveedor: "Pago a proveedor",
  gasto: "Gasto",
  nota_credito_compra: "Nota de crédito",
  venta_dia: "Venta",
  conciliacion_redondeo: "Redondeo",
};

export interface FlujoDetalleLinea {
  fecha: string;
  referencia: string | null;
  descripcion: string | null;
  monto: number; // firmado (crédito − débito); la pantalla muestra el valor absoluto
  proveedor_nombre: string | null;
  origen_tipo: string | null;
  tipo_label: string;
  centro_codigo: string | null;
  asiento_id: string;
  origen_id: string | null;
}

// Devuelve SOLO los movimientos de la cuenta que tocaron caja/banco — los que
// suman el número del flujo — con proveedor (del origen o del alias bancario).
export async function flujoDetalle(cuentaId: string, desde: string, hasta: string): Promise<FlujoDetalleLinea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_flujo_detalle", { p_cuenta: cuentaId, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(`No se pudo cargar el detalle del flujo: ${error.message}`);
  const filas = (data ?? []) as {
    fecha: string;
    referencia: string | null;
    descripcion: string | null;
    monto: number;
    proveedor_nombre: string | null;
    origen_tipo: string | null;
    centro_codigo: string | null;
    asiento_id: string;
    origen_id: string | null;
  }[];
  const aliases = await obtenerMapaAlias();
  return filas.map((f) => ({
    fecha: f.fecha,
    referencia: f.referencia,
    descripcion: f.descripcion,
    monto: Number(f.monto),
    proveedor_nombre: f.proveedor_nombre ?? detectarProveedor(f.referencia, f.descripcion, aliases),
    origen_tipo: f.origen_tipo,
    tipo_label: f.origen_tipo ? (TIPO_LABEL[f.origen_tipo] ?? "Asiento") : "Asiento",
    centro_codigo: f.centro_codigo,
    asiento_id: f.asiento_id,
    origen_id: f.origen_id,
  }));
}

// Igual que flujoDetalle pero EXPLOTADO a las líneas reales del estado de cuenta
// (las "verdes"): un gasto agrupado que concilió N líneas del banco se ve como
// esas N líneas, no como un solo movimiento. Suma el mismo número del flujo.
export async function flujoDetalleBancario(
  cuentaId: string,
  desde: string,
  hasta: string,
): Promise<FlujoDetalleLinea[]> {
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
  const aliases = await obtenerMapaAlias();
  return filas.map((f) => ({
    fecha: f.fecha,
    referencia: f.referencia,
    descripcion: f.descripcion,
    monto: Number(f.monto),
    proveedor_nombre: detectarProveedor(f.referencia, f.descripcion, aliases),
    origen_tipo: f.origen_tipo,
    tipo_label: f.origen_tipo ? (TIPO_LABEL[f.origen_tipo] ?? "Asiento") : "Banco",
    centro_codigo: f.centro_codigo === "(sin centro)" ? null : f.centro_codigo,
    asiento_id: f.asiento_id,
    origen_id: f.origen_id,
  }));
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

export interface DetalleCuentaLinea {
  fecha: string;
  descripcion: string; // descripción real del ítem (gasto/factura), no la glosa genérica
  centro_codigo: string | null;
  origen_tipo: string | null;
  origen_id: string | null;
  asiento_id: string;
  asiento_numero: number | null;
  monto: number; // débito - crédito (neto)
}

// Detalle "legible" de una cuenta: los ítems que la componen con su descripción
// real (ej. el gasto "licencia ncq"), para el drill-down del Estado de Resultados.
// No es la vista contable del Mayor. Excluye anulados y (opcional) prorrateo.
export async function detalleCuenta(
  cuentaId: string,
  desde?: string,
  hasta?: string,
  sinProrrateo = false,
): Promise<DetalleCuentaLinea[]> {
  const movs = (await mayorCuenta(cuentaId, desde, hasta, sinProrrateo, true)) as {
    fecha: string;
    asiento_id: string;
    asiento_numero: number | null;
    glosa: string | null;
    centro_codigo: string | null;
    origen_tipo: string | null;
    origen_id: string | null;
    debito: number;
    credito: number;
  }[];

  // Enriquecer con la descripción real del gasto (la glosa del asiento suele ser
  // genérica, "Gasto"). Para facturas y otros orígenes se usa la glosa.
  const supabase = await createClient();
  const gastoIds = [...new Set(movs.filter((m) => m.origen_tipo === "gasto" && m.origen_id).map((m) => m.origen_id as string))];
  const desc = new Map<string, string>();
  if (gastoIds.length) {
    const { data } = await supabase.from("gastos").select("id, descripcion").in("id", gastoIds);
    ((data ?? []) as { id: string; descripcion: string | null }[]).forEach((g) => {
      if (g.descripcion) desc.set(g.id, g.descripcion);
    });
  }

  return movs.map((m) => ({
    fecha: m.fecha,
    centro_codigo: m.centro_codigo,
    origen_tipo: m.origen_tipo,
    origen_id: m.origen_id,
    asiento_id: m.asiento_id,
    asiento_numero: m.asiento_numero,
    descripcion: (m.origen_tipo === "gasto" && m.origen_id && desc.get(m.origen_id)) || m.glosa || "—",
    monto: Number(m.debito) - Number(m.credito),
  }));
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
