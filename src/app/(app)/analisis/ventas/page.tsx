import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  resumenPeriodo,
  serieMensual,
  ventasPorDia,
  ultimoMesConVentas,
  mesActual,
  sumarMeses,
  rangoMes,
  rangoYTD,
  etiquetaMes,
  centrosConVenta,
  type ResumenCentro,
  type PuntoMes,
} from "@/lib/data/analisis";
import DashboardVentas from "@/components/analisis/DashboardVentas";

type SP = { mes?: string; prorrateo?: string };

const N_TENDENCIA = 12;

export default async function AnalisisVentasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/");
  const sp = await searchParams;

  const conProrrateo = sp.prorrateo !== "no";
  const mesSel = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : (await ultimoMesConVentas()) ?? mesActual();

  const mesAnt = sumarMeses(mesSel, -1);
  const mesAnioPasado = sumarMeses(mesSel, -12);

  // Dos oleadas de lecturas en paralelo (todas de solo lectura).
  const [serie, selP, antP, anioPasadoP, ytdP, ytdPasadoP, dias] = await Promise.all([
    serieMensual(mesSel, N_TENDENCIA, conProrrateo),
    resumenPeriodo(rangoMes(mesSel).desde, rangoMes(mesSel).hasta, conProrrateo),
    resumenPeriodo(rangoMes(mesAnt).desde, rangoMes(mesAnt).hasta, conProrrateo),
    resumenPeriodo(rangoMes(mesAnioPasado).desde, rangoMes(mesAnioPasado).hasta, conProrrateo),
    resumenPeriodo(rangoYTD(mesSel).desde, rangoYTD(mesSel).hasta, conProrrateo),
    resumenPeriodo(rangoYTD(mesAnioPasado).desde, rangoYTD(mesAnioPasado).hasta, conProrrateo),
    ventasPorDia(rangoMes(mesSel).desde, rangoMes(mesSel).hasta),
  ]);

  const centros = centrosConVenta(serie);

  // Aplanar la serie a filas amigables para los gráficos.
  const serieChart = serie.map((p: PuntoMes) => {
    const row: Record<string, number | string> = {
      etiqueta: p.etiqueta,
      ventas: round2(p.total.ventas),
      margen: round2(p.total.margenBruto),
      utilidad: round2(p.total.utilidad),
    };
    for (const c of centros) row[`v_${c}`] = round2(p.porCentro[c]?.ventas ?? 0);
    return row;
  });

  const ventasDia = dias.map((d) => ({ dia: d.fecha.slice(8, 10), fecha: d.fecha, total: round2(d.total) }));

  const porCentroSel = centros.map((c) => ({ centro: c, ...redondear(selP.porCentro[c] ?? vacio()) }));

  const hayAnioPasado = anioPasadoP.total.ventas > 0 || anioPasadoP.total.gastos > 0;
  const hayYtdPasado = ytdPasadoP.total.ventas > 0 || ytdPasadoP.total.gastos > 0;

  const data = {
    mesSel,
    etiquetaSel: etiquetaMes(mesSel),
    etiquetaAnt: etiquetaMes(mesAnt),
    etiquetaAnioPasado: etiquetaMes(mesAnioPasado),
    anioYTD: Number(mesSel.slice(0, 4)),
    sel: redondear(selP.total),
    ant: redondear(antP.total),
    anioPasado: redondear(anioPasadoP.total),
    ytd: redondear(ytdP.total),
    ytdPasado: redondear(ytdPasadoP.total),
    hayAnioPasado,
    hayYtdPasado,
    centros,
    porCentroSel,
    serie: serieChart,
    ventasDia,
  };

  const prevHref = hrefMes(sumarMeses(mesSel, -1), conProrrateo);
  const nextHref = hrefMes(sumarMeses(mesSel, 1), conProrrateo);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Ventas y rentabilidad</h1>
          <p className="text-sm text-neutral-500">
            Ventas, margen y utilidad por sucursal. Los montos salen del Estado de Resultados (sin IVA).
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
          <label className="flex items-center gap-2 pb-1.5 text-neutral-600">
            <input type="checkbox" name="prorrateo" value="no" defaultChecked={!conProrrateo} className="h-4 w-4" />
            Sin prorrateo
          </label>
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
            Ver
          </button>
        </form>
      </div>

      <DashboardVentas data={data} />
    </div>
  );
}

// ---- helpers de serialización (números planos para el cliente) ----

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function vacio(): ResumenCentro {
  return { ventas: 0, costo: 0, margenBruto: 0, margenPct: 0, gastos: 0, utilidadOper: 0, otrosIng: 0, otrosGas: 0, utilidad: 0 };
}
function redondear(r: ResumenCentro): ResumenCentro {
  return {
    ventas: round2(r.ventas),
    costo: round2(r.costo),
    margenBruto: round2(r.margenBruto),
    margenPct: r.margenPct,
    gastos: round2(r.gastos),
    utilidadOper: round2(r.utilidadOper),
    otrosIng: round2(r.otrosIng),
    otrosGas: round2(r.otrosGas),
    utilidad: round2(r.utilidad),
  };
}
function hrefMes(mes: string, prorrateo: boolean): string {
  const p = new URLSearchParams({ mes });
  if (!prorrateo) p.set("prorrateo", "no");
  return `/analisis/ventas?${p.toString()}`;
}
