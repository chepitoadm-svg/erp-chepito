import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { escenarioSucursales } from "@/lib/data/finanzas";
import { ultimoMesConVentas, mesActual, sumarMeses, rangoMes, etiquetaMes } from "@/lib/data/analisis";
import EscenariosSucursales from "@/components/analisis/EscenariosSucursales";

type SP = { mes?: string };

export default async function EscenariosPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/");
  const sp = await searchParams;
  const mesSel = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : (await ultimoMesConVentas()) ?? mesActual();

  const { desde, hasta } = rangoMes(mesSel);
  const esc = await escenarioSucursales(desde, hasta);

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const data = {
    etiquetaSel: etiquetaMes(mesSel),
    utilidadActual: round2(esc.utilidadActual),
    costosCompartidos: round2(esc.costosCompartidos),
    segmentos: esc.segmentos.map((s) => ({
      ...s,
      ventas: round2(s.ventas),
      contribucion: round2(s.contribucion),
      fijosDirectos: round2(s.fijosDirectos),
      fijosCompartidos: round2(s.fijosCompartidos),
      utilidadReportada: round2(s.utilidadReportada),
      aporte: round2(s.aporte),
    })),
  };

  const href = (mes: string) => `/analisis/finanzas/escenarios?mes=${mes}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/analisis/finanzas" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Rentabilidad
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">Escenarios por sucursal · mantener o cerrar</h1>
          <p className="text-sm text-neutral-500">
            Qué aporta de verdad cada sucursal y qué pasa con la utilidad si cerrás alguna. Los costos compartidos (Taller,
            administración) no desaparecen al cerrar: por eso no se restan del ahorro.
          </p>
        </div>
        <form method="get" className="flex items-center gap-1 text-sm">
          <Link href={href(sumarMeses(mesSel, -1))} className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:bg-neutral-50">
            ‹
          </Link>
          <input
            type="month"
            name="mes"
            defaultValue={mesSel}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-800 focus:border-neutral-500 focus:outline-none"
          />
          <Link href={href(sumarMeses(mesSel, 1))} className="rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:bg-neutral-50">
            ›
          </Link>
          <button type="submit" className="ml-1 rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
            Ver
          </button>
        </form>
      </div>

      <EscenariosSucursales data={data} />
    </div>
  );
}
