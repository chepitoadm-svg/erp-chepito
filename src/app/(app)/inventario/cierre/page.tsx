import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCierres } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function CierresPage() {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const puedeAjustar = await tienePermiso("inventario.ajustar");
  const cierres = await listarCierres();

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Cierre de inventario</h1>
          <p className="text-sm text-neutral-500">
            Conteo físico mensual: devuelve a Inventario lo no consumido y detecta faltantes.
          </p>
        </div>
        {puedeAjustar && (
          <Link
            href="/inventario/cierre/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nuevo cierre
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 font-medium">Centro</th>
              <th className="px-4 py-3 text-right font-medium">Físico</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cierres.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay cierres.
                </td>
              </tr>
            )}
            {cierres.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-neutral-600">{c.fecha}</td>
                <td className="px-4 py-3 text-neutral-800">{c.bodega_codigo}</td>
                <td className="px-4 py-3 text-neutral-600">{c.centro_codigo ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                  {fmt(c.valor_fisico)}
                </td>
                <td
                  className={
                    "px-4 py-3 text-right tabular-nums " +
                    (c.diferencia < 0 ? "text-red-600" : c.diferencia > 0 ? "text-amber-700" : "text-neutral-400")
                  }
                >
                  {fmt(c.diferencia)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>
                    {c.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/inventario/cierre/${c.id}`} className="text-neutral-600 hover:text-neutral-900">
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
