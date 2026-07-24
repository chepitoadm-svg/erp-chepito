import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPeriodos } from "@/lib/data/admin";
import { cerrarPeriodo, reabrirPeriodo } from "../actions";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function PeriodosPage() {
  if (!(await tienePermiso("periodos.cerrar"))) redirect("/admin");

  const [periodos, puedeReabrir] = await Promise.all([
    listarPeriodos(2026),
    tienePermiso("periodos.reabrir"),
  ]);

  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Administración
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Periodos contables 2026</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Un periodo no se cierra si tiene borradores o pools sin bases de prorrateo.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Mes</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Pendientes</th>
              <th className="px-4 py-3 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {periodos.map((p) => {
              const bloqueosCierre: string[] = [];
              if (p.n_borradores > 0) bloqueosCierre.push(`${p.n_borradores} borrador(es)`);
              if (p.pools_sin_bases) bloqueosCierre.push(`sin bases: ${p.pools_sin_bases}`);
              const puedeC = p.estado === "abierto" && bloqueosCierre.length === 0;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {MESES[p.mes]} {p.anio}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        p.estado === "abierto"
                          ? "bg-green-50 text-green-700"
                          : p.estado === "cerrado"
                            ? "bg-neutral-200 text-neutral-600"
                            : "bg-red-50 text-red-600"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {p.estado === "abierto" && bloqueosCierre.length > 0
                      ? bloqueosCierre.join(" · ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.estado === "abierto" && (
                      <form action={cerrarPeriodo} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          disabled={!puedeC}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
                          title={puedeC ? undefined : "Resolvé los pendientes primero"}
                        >
                          Cerrar
                        </button>
                      </form>
                    )}
                    {p.estado === "cerrado" && puedeReabrir && (
                      <form action={reabrirPeriodo} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                        >
                          Reabrir
                        </button>
                      </form>
                    )}
                    {p.estado === "cerrado" && !puedeReabrir && (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
