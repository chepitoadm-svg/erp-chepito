// Capa de datos de FINANZAS (análisis costo-volumen-utilidad / punto de
// equilibrio). Solo lecturas, corre en el servidor con RLS. Reutiliza el motor
// de reportes ya verificado (fn_estado_resultados) para que ventas, costos y
// utilidad salgan IDÉNTICOS al Estado de Resultados oficial. No hace
// contabilidad nueva.
//
// Clasificación fijo/variable: por defecto la SECCIÓN del ER decide (costo de
// ventas 51-* = variable; gastos de operación y otros gastos = fijo). El usuario
// puede sobrescribir cuentas puntuales en `clasificacion_costo` (ej. marcar las
// comisiones de datáfono como variables). El punto de equilibrio es sensible a
// esto, por eso es configurable.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { estadoResultados } from "@/lib/data/reportes";
import { etiquetaMes, rangoMes, sumarMeses } from "@/lib/data/analisis";

interface FilaER {
  centro_codigo: string;
  seccion: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  monto: number;
}

export type TipoCosto = "fijo" | "variable";

// Análisis CVP de un periodo (total o de un centro). Montos en colones sin IVA.
export interface CVP {
  ventas: number;
  costoVentas: number; // sección costo_ventas (para el margen bruto)
  gastos: number; // gastos de operación
  otrosIng: number;
  otrosGas: number;
  variables: number; // costos clasificados VARIABLES
  fijos: number; // costos clasificados FIJOS (incluye otros gastos)
  margenContribucion: number; // ventas − variables
  mcPct: number; // margen de contribución / ventas (0 si no hay ventas)
  costosFijosEfectivos: number; // fijos − otros ingresos (base del punto de equilibrio)
  margenBruto: number; // ventas − costo de ventas
  margenBrutoPct: number;
  utilidadOper: number; // margen bruto − gastos
  utilidad: number; // antes de impuestos (== Estado de Resultados)
  margenNetoPct: number;
  puntoEquilibrio: number | null; // ventas mensuales para utilidad 0 (null si el MC% ≤ 0)
  margenSeguridadPct: number | null; // (ventas − PE) / ventas
  gao: number | null; // grado de apalancamiento operativo = MC / utilidad
}

export interface PuntoCVP {
  mes: string; // "YYYY-MM"
  etiqueta: string; // "ago 2026"
  total: CVP;
  porCentro: Record<string, CVP>;
}

type OverrideMap = Map<string, TipoCosto>; // cuenta_codigo → tipo

// La sección decide el default; el override manda si existe.
function tipoDe(seccion: string, codigo: string, ov: OverrideMap): TipoCosto | null {
  const o = ov.get(codigo);
  if (seccion === "costo_ventas") return o ?? "variable";
  if (seccion === "gastos_operacion" || seccion === "otros_gastos") return o ?? "fijo";
  return null; // ingresos no son costos
}

function crudo() {
  return { ventas: 0, costoVentas: 0, gastos: 0, otrosIng: 0, otrosGas: 0, variables: 0, fijos: 0 };
}
type Crudo = ReturnType<typeof crudo>;

function acumular(dst: Crudo, f: FilaER, ov: OverrideMap) {
  const m = Number(f.monto);
  switch (f.seccion) {
    case "ingresos_operacion":
      dst.ventas += m;
      break;
    case "otros_ingresos":
      dst.otrosIng += m;
      break;
    case "costo_ventas":
      dst.costoVentas += m;
      break;
    case "gastos_operacion":
      dst.gastos += m;
      break;
    case "otros_gastos":
      dst.otrosGas += m;
      break;
  }
  const t = tipoDe(f.seccion, f.cuenta_codigo, ov);
  if (t === "variable") dst.variables += m;
  else if (t === "fijo") dst.fijos += m;
}

function finalizar(c: Crudo): CVP {
  const margenContribucion = c.ventas - c.variables;
  const mcPct = c.ventas ? margenContribucion / c.ventas : 0;
  const costosFijosEfectivos = c.fijos - c.otrosIng;
  const utilidad = margenContribucion - costosFijosEfectivos; // == ER
  const margenBruto = c.ventas - c.costoVentas;
  const utilidadOper = margenBruto - c.gastos;
  // Punto de equilibrio: solo tiene sentido si cada venta deja contribución.
  const puntoEquilibrio = mcPct > 0 ? Math.max(0, costosFijosEfectivos / mcPct) : null;
  const margenSeguridadPct =
    puntoEquilibrio != null && c.ventas > 0 ? (c.ventas - puntoEquilibrio) / c.ventas : null;
  const gao = utilidad > 0 ? margenContribucion / utilidad : null;
  return {
    ventas: c.ventas,
    costoVentas: c.costoVentas,
    gastos: c.gastos,
    otrosIng: c.otrosIng,
    otrosGas: c.otrosGas,
    variables: c.variables,
    fijos: c.fijos,
    margenContribucion,
    mcPct,
    costosFijosEfectivos,
    margenBruto,
    margenBrutoPct: c.ventas ? margenBruto / c.ventas : 0,
    utilidadOper,
    utilidad,
    margenNetoPct: c.ventas ? utilidad / c.ventas : 0,
    puntoEquilibrio,
    margenSeguridadPct,
    gao,
  };
}

async function overridesMap(supabase: Awaited<ReturnType<typeof createClient>>): Promise<OverrideMap> {
  const { data } = await supabase.from("clasificacion_costo").select("tipo, cuenta:cuentas(codigo)");
  const m: OverrideMap = new Map();
  for (const r of (data ?? []) as unknown as { tipo: TipoCosto; cuenta: { codigo: string } | null }[]) {
    if (r.cuenta?.codigo) m.set(r.cuenta.codigo, r.tipo);
  }
  return m;
}

/** Análisis CVP de un periodo, total y por centro (idéntico al ER oficial). */
export async function cvpPeriodo(
  desde: string,
  hasta: string,
  prorrateo = true,
  ov?: OverrideMap,
): Promise<{ total: CVP; porCentro: Record<string, CVP> }> {
  const supabase = await createClient();
  const overrides = ov ?? (await overridesMap(supabase));
  const filas = (await estadoResultados(desde, hasta, prorrateo)) as unknown as FilaER[];
  const porCentroRaw: Record<string, Crudo> = {};
  const totalRaw = crudo();
  for (const f of filas) {
    const c = (porCentroRaw[f.centro_codigo] ??= crudo());
    acumular(c, f, overrides);
    acumular(totalRaw, f, overrides);
  }
  const porCentro: Record<string, CVP> = {};
  for (const [k, v] of Object.entries(porCentroRaw)) porCentro[k] = finalizar(v);
  return { total: finalizar(totalRaw), porCentro };
}

/** Serie mensual de análisis CVP terminada en `hastaMes`, `n` meses atrás. */
export async function serieCVP(hastaMes: string, n: number, prorrateo = true): Promise<PuntoCVP[]> {
  const supabase = await createClient();
  const ov = await overridesMap(supabase);
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(hastaMes, -(n - 1 - i)));
  return Promise.all(
    meses.map(async (ym) => {
      const { desde, hasta } = rangoMes(ym);
      const r = await cvpPeriodo(desde, hasta, prorrateo, ov);
      return { mes: ym, etiqueta: etiquetaMes(ym), total: r.total, porCentro: r.porCentro };
    }),
  );
}

// ---- Escenarios por sucursal (análisis "mantener o cerrar") ----

// Aporte de una sucursal final: lo que deja DESPUÉS de cubrir sus propios costos
// directos, para pagar los costos compartidos (Taller, administración) y la
// utilidad. Es el número que de verdad decide si conviene cerrarla — no la
// "utilidad" con todo el prorrateo encima, que carga costos que NO desaparecen
// si la sucursal cierra.
export interface SegmentoCentro {
  centro: string; // código
  nombre: string;
  ventas: number;
  contribucion: number; // ventas − costos variables (con prorrateo: incluye lo que jala del Taller). SE PIERDE si cierra.
  mcPct: number;
  fijosDirectos: number; // costos fijos propios de la sucursal (sin prorrateo). SE AHORRAN si cierra.
  fijosCompartidos: number; // parte de Taller/administración que tiene asignada. SE MANTIENE si cierra.
  utilidadReportada: number; // utilidad con todo el prorrateo (como se ve en el ER por centro)
  aporte: number; // contribución − fijos directos (a compartidos + utilidad)
}

export interface Escenarios {
  utilidadActual: number; // utilidad de toda la empresa (== ER)
  costosCompartidos: number; // pool de Taller + administración (no atribuible), informativo
  segmentos: SegmentoCentro[]; // sucursales finales, ordenadas por aporte desc
}

/** Análisis mantener-o-cerrar por sucursal, para un periodo. Combina la vista CON
 *  prorrateo (contribución, que captura lo que cada sucursal jala del Taller) con
 *  la vista SIN prorrateo (costos fijos DIRECTOS, los únicos que se ahorran al
 *  cerrar). */
export async function escenarioSucursales(desde: string, hasta: string): Promise<Escenarios> {
  const supabase = await createClient();
  const ov = await overridesMap(supabase);
  const [conPro, sinPro, cc] = await Promise.all([
    cvpPeriodo(desde, hasta, true, ov),
    cvpPeriodo(desde, hasta, false, ov),
    supabase.from("centros_costo").select("codigo, nombre, tipo"),
  ]);
  const centros = (cc.data ?? []) as { codigo: string; nombre: string; tipo: string }[];

  const segmentos: SegmentoCentro[] = [];
  for (const c of centros) {
    if (c.tipo !== "final") continue;
    const p = conPro.porCentro[c.codigo];
    const s = sinPro.porCentro[c.codigo];
    if (!p && !s) continue;
    const ventas = p?.ventas ?? 0;
    const contribucion = p?.margenContribucion ?? 0;
    const fijosDirectos = s?.fijos ?? 0;
    const fijosTotal = p?.fijos ?? 0;
    segmentos.push({
      centro: c.codigo,
      nombre: c.nombre,
      ventas,
      contribucion,
      mcPct: p?.mcPct ?? 0,
      fijosDirectos,
      fijosCompartidos: fijosTotal - fijosDirectos,
      utilidadReportada: p?.utilidad ?? 0,
      aporte: contribucion - fijosDirectos,
    });
  }
  segmentos.sort((a, b) => b.aporte - a.aporte);

  // Pool compartido (Taller + General): costo directo de los centros intermedios.
  let costosCompartidos = 0;
  for (const c of centros) {
    if (c.tipo === "intermedio") {
      const s = sinPro.porCentro[c.codigo];
      if (s) costosCompartidos += s.variables + s.fijos - s.otrosIng;
    }
  }

  return { utilidadActual: conPro.total.utilidad, costosCompartidos, segmentos };
}

/** Escenario promediado sobre los últimos `nMeses` (terminando en `hastaMes`),
 *  usando solo los meses CON actividad. Sirve para no decidir con un mes atípico:
 *  el costeo periódico hace que un mes de compras altas se vea malo y el siguiente
 *  bueno. Devuelve promedios MENSUALES, misma forma que escenarioSucursales. */
export async function escenarioSucursalesPromedio(
  hastaMes: string,
  nMeses: number,
): Promise<Escenarios & { mesesUsados: number; meses: string[] }> {
  const meses = Array.from({ length: nMeses }, (_, i) => sumarMeses(hastaMes, -(nMeses - 1 - i)));
  const porMes = await Promise.all(
    meses.map(async (ym) => {
      const { desde, hasta } = rangoMes(ym);
      return { ym, esc: await escenarioSucursales(desde, hasta) };
    }),
  );
  // Solo meses OPERATIVOS. Se excluyen los no representativos (arranque, cierre
  // parcial): un mes cuenta si sus ventas llegan al menos al 25% del mes pico de
  // la ventana. Así el mes de cutover (ventas casi nulas pero con costos de
  // apertura) no distorsiona el promedio.
  const ventasMes = porMes.map((p) => ({ ...p, v: p.esc.segmentos.reduce((s, x) => s + x.ventas, 0) }));
  const maxV = Math.max(0, ...ventasMes.map((x) => x.v));
  const usados = ventasMes.filter((x) => x.v > 0 && x.v >= 0.25 * maxV);
  const n = usados.length || 1;

  // Acumular por centro y dividir por la cantidad de meses usados.
  const acc = new Map<string, { nombre: string; ventas: number; contribucion: number; fijosDirectos: number; fijosCompartidos: number; utilidadReportada: number }>();
  let utilidadActual = 0;
  let costosCompartidos = 0;
  for (const { esc } of usados) {
    utilidadActual += esc.utilidadActual;
    costosCompartidos += esc.costosCompartidos;
    for (const s of esc.segmentos) {
      const a = acc.get(s.centro) ?? { nombre: s.nombre, ventas: 0, contribucion: 0, fijosDirectos: 0, fijosCompartidos: 0, utilidadReportada: 0 };
      a.ventas += s.ventas;
      a.contribucion += s.contribucion;
      a.fijosDirectos += s.fijosDirectos;
      a.fijosCompartidos += s.fijosCompartidos;
      a.utilidadReportada += s.utilidadReportada;
      acc.set(s.centro, a);
    }
  }

  const segmentos: SegmentoCentro[] = [...acc.entries()]
    .map(([centro, a]) => {
      const ventas = a.ventas / n;
      const contribucion = a.contribucion / n;
      const fijosDirectos = a.fijosDirectos / n;
      return {
        centro,
        nombre: a.nombre,
        ventas,
        contribucion,
        mcPct: a.ventas ? a.contribucion / a.ventas : 0,
        fijosDirectos,
        fijosCompartidos: a.fijosCompartidos / n,
        utilidadReportada: a.utilidadReportada / n,
        aporte: contribucion - fijosDirectos,
      };
    })
    .sort((x, y) => y.aporte - x.aporte);

  return {
    utilidadActual: utilidadActual / n,
    costosCompartidos: costosCompartidos / n,
    segmentos,
    mesesUsados: usados.length,
    meses: usados.map((u) => u.ym),
  };
}

// ---- Clasificación (para la pantalla de configuración) ----

export interface CuentaClasificable {
  id: string;
  codigo: string;
  nombre: string;
  seccion: string; // costo_ventas | gastos_operacion | otros_gastos
  defaultTipo: TipoCosto; // el que aplica si no hay override
  tipo: TipoCosto; // el efectivo (override o default)
  esOverride: boolean; // true si el usuario lo fijó a mano
  monto: number; // magnitud en el periodo, para ordenar por relevancia
}

/** Cuentas de costo/gasto con movimiento en el periodo, con su clasificación
 *  efectiva. Sirve para la pantalla donde el usuario ajusta fijo/variable. */
export async function cuentasClasificables(desde: string, hasta: string): Promise<CuentaClasificable[]> {
  const supabase = await createClient();
  const [ov, filasRaw] = await Promise.all([
    overridesMap(supabase),
    estadoResultados(desde, hasta, false) as unknown as Promise<FilaER[]>,
  ]);

  // Sumar por cuenta (a través de centros) solo las secciones de costo.
  const secciones = new Set(["costo_ventas", "gastos_operacion", "otros_gastos"]);
  const porCuenta = new Map<string, { codigo: string; nombre: string; seccion: string; monto: number }>();
  for (const f of filasRaw) {
    if (!secciones.has(f.seccion)) continue;
    const e = porCuenta.get(f.cuenta_codigo) ?? {
      codigo: f.cuenta_codigo,
      nombre: f.cuenta_nombre,
      seccion: f.seccion,
      monto: 0,
    };
    e.monto += Number(f.monto);
    porCuenta.set(f.cuenta_codigo, e);
  }
  if (porCuenta.size === 0) return [];

  // Resolver los id de esas cuentas.
  const codigos = [...porCuenta.keys()];
  const { data: cuentas } = await supabase.from("cuentas").select("id, codigo").in("codigo", codigos);
  const idPorCodigo = new Map((cuentas ?? []).map((c) => [c.codigo, c.id]));

  const out: CuentaClasificable[] = [];
  for (const [codigo, e] of porCuenta) {
    const id = idPorCodigo.get(codigo);
    if (!id) continue;
    const defaultTipo: TipoCosto = e.seccion === "costo_ventas" ? "variable" : "fijo";
    const override = ov.get(codigo);
    out.push({
      id,
      codigo,
      nombre: e.nombre,
      seccion: e.seccion,
      defaultTipo,
      tipo: override ?? defaultTipo,
      esOverride: override != null,
      monto: e.monto,
    });
  }
  return out.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
}
