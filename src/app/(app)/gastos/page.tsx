import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarGastos } from "@/lib/data/gastos";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function GastosPage() {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const gastos = await listarGastos();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Gastos</h1>
          <p className="text-sm text-neutral-500">
            Gastos del mes por centro de costo (alquiler, servicios, planilla, caja chica…). Alimenta
            el Estado de Resultados por panadería.
          </p>
        </div>
        <Link
          href="/gastos/nuevo"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo gasto
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Centro</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {gastos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay gastos registrados.
                </td>
              </tr>
            )}
            {gastos.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3 text-neutral-600">{g.fecha}</td>
                <td className="px-4 py-3 text-neutral-800">{g.centro_codigo ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {g.cuenta_codigo ? `${g.cuenta_codigo} · ${g.cuenta_nombre}` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-500">{g.descripcion ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                  {fmt(g.total)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[g.estado]}`}>
                    {g.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/gastos/${g.id}`} className="text-neutral-600 hover:text-neutral-900">
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
