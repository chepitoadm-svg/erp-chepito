import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarExistenciasValoradas } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ExistenciasPage() {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");

  const filas = await listarExistenciasValoradas();
  const total = filas.reduce((s, f) => s + f.valor, 0);

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Existencias valoradas</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Cantidad y valor por bodega, al costo promedio ponderado. Solo las bodegas
        de tus sucursales.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Costo prom.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  No hay existencias que mostrar.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={`${f.articulo_id}-${i}`}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">{f.articulo_codigo}</td>
                <td className="px-4 py-3 text-neutral-900">{f.articulo_nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{f.bodega_codigo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(f.cantidad)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(f.costo_promedio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(f.valor)}</td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-medium text-neutral-700">
                  Total valorado
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                  {fmt(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
