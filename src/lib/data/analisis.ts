// Capa de datos de ANÁLISIS (dashboards). Solo lecturas, corre en el servidor
// con RLS. Reutiliza el motor de reportes ya verificado (fn_estado_resultados)
// para que los márgenes y utilidades salgan IDÉNTICOS al Estado de Resultados
// oficial. No hace contabilidad nueva ni escribe nada.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { estadoResultados } from "@/lib/data/reportes";

// Fila cruda del Estado de Resultados por centro.
interface FilaER {
  centro_codigo: string;
  seccion: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  monto: number;
}

// Resumen financiero de un centro (o del total) en un periodo. Los montos son
// magnitudes positivas por sección; los derivados (margen, utilidad) se calculan
// con la misma fórmula que el Estado de Resultados.
export interface ResumenCentro {
  ventas: number; // ingresos de operación (sin IVA)
  costo: number; // costo de ventas
  margenBruto: number; // ventas - costo
  margenPct: number; // margenBruto / ventas (0 si no hay ventas)
  gastos: number; // gastos de operación
  utilidadOper: number; // margenBruto - gastos
  otrosIng: number;
  otrosGas: number;
  utilidad: number; // utilidad antes de impuestos
}

export interface ResumenPeriodo {
  porCentro: Record<string, ResumenCentro>;
  total: ResumenCentro;
}

export interface PuntoMes {
  mes: string; // "YYYY-MM"
  etiqueta: string; // "ago 2026"
  total: ResumenCentro;
  porCentro: Record<string, ResumenCentro>;
}

export interface VentaDiaPunto {
  fecha: string; // "YYYY-MM-DD"
  total: number; // ventas netas del día (gravado + exento), confirmadas
  porCentro: Record<string, number>;
}

// ---- Helpers de fechas (trabajan con "YYYY-MM" y "YYYY-MM-DD" en UTC) ----

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partes(ym: string): { a: number; m: number } {
  const [a, m] = ym.split("-").map(Number);
  return { a, m };
}
export function ultimoDiaMes(ym: string): string {
  const { a, m } = partes(ym);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}
export function rangoMes(ym: string): { desde: string; hasta: string } {
  return { desde: `${ym}-01`, hasta: ultimoDiaMes(ym) };
}
export function sumarMeses(ym: string, delta: number): string {
  const { a, m } = partes(ym);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function etiquetaMes(ym: string): string {
  const { a, m } = partes(ym);
  return `${MESES[m - 1]} ${a}`;
}
export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** Rango acumulado del año (1 de enero → fin del mes dado). */
export function rangoYTD(ym: string): { desde: string; hasta: string } {
  const { a } = partes(ym);
  return { desde: `${a}-01-01`, hasta: ultimoDiaMes(ym) };
}

// ---- Reducción del Estado de Resultados a un resumen ----

function crudo() {
  return { ventas: 0, costo: 0, gastos: 0, otrosIng: 0, otrosGas: 0 };
}
type Crudo = ReturnType<typeof crudo>;

function acumular(dst: Crudo, seccion: string, monto: number) {
  switch (seccion) {
    case "ingresos_operacion":
      dst.ventas += monto;
      break;
    case "costo_ventas":
      dst.costo += monto;
      break;
    case "gastos_operacion":
      dst.gastos += monto;
      break;
    case "otros_ingresos":
      dst.otrosIng += monto;
      break;
    case "otros_gastos":
      dst.otrosGas += monto;
      break;
  }
}

function finalizar(c: Crudo): ResumenCentro {
  const margenBruto = c.ventas - c.costo;
  const utilidadOper = margenBruto - c.gastos;
  return {
    ventas: c.ventas,
    costo: c.costo,
    margenBruto,
    margenPct: c.ventas ? margenBruto / c.ventas : 0,
    gastos: c.gastos,
    utilidadOper,
    otrosIng: c.otrosIng,
    otrosGas: c.otrosGas,
    utilidad: utilidadOper + c.otrosIng - c.otrosGas,
  };
}

/** Resumen financiero de un periodo, por centro y total. Idéntico al Estado de
 *  Resultados oficial (mismas cuentas, mismo prorrateo). */
export async function resumenPeriodo(desde: string, hasta: string, prorrateo = true): Promise<ResumenPeriodo> {
  const filas = (await estadoResultados(desde, hasta, prorrateo)) as unknown as FilaER[];
  const porCentroRaw: Record<string, Crudo> = {};
  const totalRaw = crudo();
  for (const f of filas) {
    const c = (porCentroRaw[f.centro_codigo] ??= crudo());
    const m = Number(f.monto);
    acumular(c, f.seccion, m);
    acumular(totalRaw, f.seccion, m);
  }
  const porCentro: Record<string, ResumenCentro> = {};
  for (const [k, v] of Object.entries(porCentroRaw)) porCentro[k] = finalizar(v);
  return { porCentro, total: finalizar(totalRaw) };
}

/** Serie mensual terminada en `hastaMes` (incluido), de `n` meses hacia atrás. */
export async function serieMensual(hastaMes: string, n: number, prorrateo = true): Promise<PuntoMes[]> {
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(hastaMes, -(n - 1 - i)));
  return Promise.all(
    meses.map(async (ym) => {
      const { desde, hasta } = rangoMes(ym);
      const r = await resumenPeriodo(desde, hasta, prorrateo);
      return { mes: ym, etiqueta: etiquetaMes(ym), total: r.total, porCentro: r.porCentro };
    }),
  );
}

/** Mes ("YYYY-MM") de la venta confirmada más reciente, o null si no hay. Sirve
 *  para que el dashboard aterrice en un mes con datos. */
export async function ultimoMesConVentas(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ventas_dia")
    .select("fecha")
    .eq("estado", "confirmado")
    .order("fecha", { ascending: false })
    .limit(1);
  const f = ((data ?? []) as { fecha: string }[])[0]?.fecha;
  return f ? f.slice(0, 7) : null;
}

/** Ventas netas confirmadas (gravado + exento, sin IVA) por día del periodo. */
export async function ventasPorDia(desde: string, hasta: string): Promise<VentaDiaPunto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_dia")
    .select("fecha, gravado, exento, estado, centro:centros_costo(codigo)")
    .eq("estado", "confirmado")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las ventas por día: ${error.message}`);

  const filas = (data ?? []) as unknown as {
    fecha: string;
    gravado: number;
    exento: number;
    centro: { codigo: string } | null;
  }[];

  const porFecha = new Map<string, VentaDiaPunto>();
  for (const f of filas) {
    const neto = Number(f.gravado) + Number(f.exento);
    const cod = f.centro?.codigo ?? "—";
    const p = porFecha.get(f.fecha) ?? { fecha: f.fecha, total: 0, porCentro: {} };
    p.total += neto;
    p.porCentro[cod] = (p.porCentro[cod] ?? 0) + neto;
    porFecha.set(f.fecha, p);
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Códigos de los centros finales (sucursales) presentes en una serie/periodo,
 *  ordenados. Excluye acumuladores intermedios que no venden (no tienen ventas). */
export function centrosConVenta(puntos: PuntoMes[]): string[] {
  const set = new Set<string>();
  for (const p of puntos) for (const [cod, r] of Object.entries(p.porCentro)) if (r.ventas) set.add(cod);
  return [...set].sort();
}
