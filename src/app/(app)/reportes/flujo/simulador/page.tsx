import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { flujoCajaPorCentro, repartoShares, compromisosPorCentro, compromisos } from "@/lib/data/reportes";
import SimuladorCierrePanel from "@/components/SimuladorCierrePanel";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimo = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  return { desde, hasta };
}
function mover(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function etiqueta(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default async function SimuladorCierrePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : "2026-07";
  const { desde, hasta } = rango(mes);

  // Datos crudos por panadería (sin reparto): el simulador decide qué se va/queda.
  // El reparto da el % del prorrateo (default: de Taller/General se va la parte de la que cierra).
  // Pendientes = lo devengado y NO pagado (alquiler, proveedores) que el flujo (base caja) no muestra.
  const [centros, reparto, pendientes, comp] = await Promise.all([
    flujoCajaPorCentro(desde, hasta, false),
    repartoShares(desde, hasta),
    compromisosPorCentro(hasta),
    compromisos(hasta),
  ]);

  return (
    <div>
      <Link href={`/reportes/flujo?mes=${mes}&vista=negocios`} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Flujo por panadería
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Simulador: ¿cerrar una panadería?</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Marcá qué se va y qué se queda si cerrás una panadería, y mirá cuánto cambia tu caja. Son números reales del
        mes; vos decidís los supuestos. Es un simulador: <b>no cambia nada en los libros</b>.
      </p>

      {/* Navegación de mes */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/reportes/flujo/simulador?mes=${mover(mes, -1)}`} className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
          ← {etiqueta(mover(mes, -1))}
        </Link>
        <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium capitalize text-white">{etiqueta(mes)}</span>
        <Link href={`/reportes/flujo/simulador?mes=${mover(mes, 1)}`} className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
          {etiqueta(mover(mes, 1))} →
        </Link>
      </div>

      {centros.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          No hay movimientos de caja este mes.
        </div>
      ) : (
        <SimuladorCierrePanel
          centros={centros}
          etiquetaMes={etiqueta(mes)}
          reparto={reparto}
          pendientes={pendientes}
          disponible={comp.disponible}
          fechaCorte={hasta}
        />
      )}
    </div>
  );
}
