import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  cvpPeriodo,
  serieCVP,
  type CVP,
  type PuntoCVP,
} from "@/lib/data/finanzas";
import {
  ventasPorDia,
  ultimoMesConVentas,
  mesActual,
  sumarMeses,
  rangoMes,
  rangoYTD,
  etiquetaMes,
} from "@/lib/data/analisis";
import DashboardFinanzas from "@/components/analisis/DashboardFinanzas";

type SP = { mes?: string; prorrateo?: string; meta?: string };
const N_TENDENCIA = 12;

export default async function AnalisisFinanzasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/");
  const sp = await searchParams;

  const conProrrateo = sp.prorrateo !== "no";
  const metaPct = clampMeta(sp.meta);
  const mesSel = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : (await ultimoMesConVentas()) ?? mesActual();
  const mesAnt = sumarMeses(mesSel, -1);

  const { desde, hasta } = rangoMes(mesSel);
  const [serie, selP, antP, ytdP, dias] = await Promise.all([
    serieCVP(mesSel, N_TENDENCIA, conProrrateo),
    cvpPeriodo(desde, hasta, conProrrateo),
    cvpPeriodo(rangoMes(mesAnt).desde, rangoMes(mesAnt).hasta, conProrrateo),
    cvpPeriodo(rangoYTD(mesSel).desde, rangoYTD(mesSel).hasta, conProrrateo),
    ventasPorDia(desde, hasta),
  ]);

  // Centros con ventas en la serie (sucursales finales).
  const centrosSet = new Set<string>();
  for (const p of serie) for (const [c, r] of Object.entries(p.porCentro)) if (r.ventas) centrosSet.add(c);
  const centros = [...centrosSet].sort();

  // Días con venta real del mes (total y por centro) — base de la meta diaria.
  const diasVenta = dias.length;
  const diasVentaPorCentro: Record<string, number> = {};
  for (const c of centros) diasVentaPorCentro[c] = dias.filter((d) => (d.porCentro[c] ?? 0) > 0).length;

  const serieChart = serie.map((p: PuntoCVP) => ({
    etiqueta: p.etiqueta,
    ventas: round2(p.total.ventas),
    puntoEquilibrio: p.total.puntoEquilibrio == null ? null : round2(p.total.puntoEquilibrio),
    utilidad: round2(p.total.utilidad),
    mcPct: round4(p.total.mcPct),
  }));

  const porCentroSel = centros.map((c) => ({ centro: c, cvp: redondear(selP.porCentro[c] ?? vacio()), dias: diasVentaPorCentro[c] }));

  const data = {
    etiquetaSel: etiquetaMes(mesSel),
    etiquetaAnt: etiquetaMes(mesAnt),
    metaPct,
    diasVenta,
    sel: redondear(selP.total),
    ant: redondear(antP.total),
    ytd: redondear(ytdP.total),
    centros,
    porCentroSel,
    serie: serieChart,
  };

  const prevHref = href(sumarMeses(mesSel, -1), conProrrateo, metaPct);
  const nextHref = href(sumarMeses(mesSel, 1), conProrrateo, metaPct);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Rentabilidad y punto de equilibrio</h1>
          <p className="text-sm text-neutral-500">
            Cuánto tenés que vender para no perder y para ganar tu meta. Sale del Estado de Resultados (sin IVA).{" "}
            <Link href="/analisis/finanzas/clasificacion" className="text-neutral-700 underline hover:text-neutral-900">
              Ajustar costos fijos/variables
            </Link>
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Link href={prevHref} className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:bg-neutral-50" title="Mes anterior">
              ‹
            </Link>
            <input
              type="month"
              name="mes"
              defaultValue={mesSel}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-800 focus:border-neutral-500 focus:outline-none"
            />
            <Link href={nextHref} className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:bg-neutral-50" title="Mes siguiente">
              ›
            </Link>
          </div>
          <label className="flex items-center gap-1 pb-1 text-neutral-600">
            Meta utilidad
            <input
              type="number"
              name="meta"
              min={0}
              max={90}
              step={1}
              defaultValue={Math.round(metaPct * 100)}
              className="w-16 rounded-md border border-neutral-300 px-2 py-1.5 text-right text-neutral-800 focus:border-neutral-500 focus:outline-none"
            />
            <span className="text-neutral-400">% s/ventas</span>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-neutral-600">
            <input type="checkbox" name="prorrateo" value="no" defaultChecked={!conProrrateo} className="h-4 w-4" />
            Sin prorrateo
          </label>
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
            Ver
          </button>
        </form>
      </div>

      <DashboardFinanzas data={data} />
    </div>
  );
}

// ---- helpers ----

function clampMeta(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0.1; // 10% por defecto
  return Math.min(0.9, n / 100);
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
function vacio(): CVP {
  return {
    ventas: 0, costoVentas: 0, gastos: 0, otrosIng: 0, otrosGas: 0, variables: 0, fijos: 0,
    margenContribucion: 0, mcPct: 0, costosFijosEfectivos: 0, margenBruto: 0, margenBrutoPct: 0,
    utilidadOper: 0, utilidad: 0, margenNetoPct: 0, puntoEquilibrio: null, margenSeguridadPct: null, gao: null,
  };
}
function redondear(c: CVP): CVP {
  return {
    ...c,
    ventas: round2(c.ventas),
    costoVentas: round2(c.costoVentas),
    gastos: round2(c.gastos),
    otrosIng: round2(c.otrosIng),
    otrosGas: round2(c.otrosGas),
    variables: round2(c.variables),
    fijos: round2(c.fijos),
    margenContribucion: round2(c.margenContribucion),
    costosFijosEfectivos: round2(c.costosFijosEfectivos),
    margenBruto: round2(c.margenBruto),
    utilidadOper: round2(c.utilidadOper),
    utilidad: round2(c.utilidad),
    puntoEquilibrio: c.puntoEquilibrio == null ? null : round2(c.puntoEquilibrio),
  };
}
function href(mes: string, prorrateo: boolean, metaPct: number): string {
  const p = new URLSearchParams({ mes });
  if (!prorrateo) p.set("prorrateo", "no");
  p.set("meta", String(Math.round(metaPct * 100)));
  return `/analisis/finanzas?${p.toString()}`;
}
