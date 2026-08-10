import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarDesechos, motivoDesechoLabel } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function DesechosPage() {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const puedeAjustar = await tienePermiso("inventario.ajustar");
  const desechos = await listarDesechos();

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Desechos de producto terminado</h1>
          <p className="text-sm text-neutral-500">
            Pan dañado o vencido en Chepito 1 y 2, valorizado por negocio.
          </p>
        </div>
        {puedeAjustar && (
          <Link
            href="/inventario/desechos/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nuevo desecho
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {desechos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay desechos registrados.
                </td>
              </tr>
            )}
            {desechos.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 text-neutral-600">{d.fecha}</td>
                <td className="px-4 py-3 text-neutral-800">{d.centro_codigo ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{motivoDesechoLabel[d.motivo]}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                  {fmt(d.valor_total)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[d.estado]}`}>
                    {d.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/inventario/desechos/${d.id}`} className="text-neutral-600 hover:text-neutral-900">
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
