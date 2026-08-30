import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCostosMes } from "@/lib/data/costoProduccion";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function CostosPage() {
  if (!(await tienePermiso("costos.registrar"))) redirect("/");
  const costos = await listarCostosMes();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Costo de ventas del mes</h1>
          <p className="text-sm text-neutral-500">
            Costo de la materia prima consumida por panadería (del app de producción). Da el renglón
            de costo de ventas en el Estado de Resultados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/costos/desecho" className="text-sm text-neutral-500 hover:text-neutral-900">
            🗑️ Desecho
          </Link>
          <Link
            href="/costos/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Calcular mes
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Mes</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {costos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay costos calculados.
                </td>
              </tr>
            )}
            {costos.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-neutral-800">{c.periodo.slice(0, 7)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                  {fmt(c.total)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>
                    {c.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/costos/${c.id}`} className="text-neutral-600 hover:text-neutral-900">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
