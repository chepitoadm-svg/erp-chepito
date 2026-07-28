import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarAjustes } from "@/lib/data/inventario";

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function AjustesPage() {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const puedeAjustar = await tienePermiso("inventario.ajustar");
  const ajustes = await listarAjustes();

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Ajustes de inventario</h1>
          <p className="text-sm text-neutral-500">Mermas y sobrantes, con su asiento al confirmar.</p>
        </div>
        {puedeAjustar && (
          <Link
            href="/inventario/ajustes/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nuevo ajuste
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 text-right font-medium">Líneas</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ajustes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay ajustes.
                </td>
              </tr>
            )}
            {ajustes.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-neutral-600">{a.fecha}</td>
                <td className="px-4 py-3 text-neutral-700">{a.bodega_codigo}</td>
                <td className="px-4 py-3 text-neutral-900">{a.motivo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{a.n_lineas}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[a.estado]}`}>
                    {a.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/inventario/ajustes/${a.id}`}
                    className="text-neutral-600 hover:text-neutral-900"
                  >
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
