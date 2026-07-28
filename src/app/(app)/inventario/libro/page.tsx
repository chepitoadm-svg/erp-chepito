import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { libroInventarios } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hoyCR(): string {
  // Fecha de Costa Rica (UTC-6) en formato YYYY-MM-DD.
  const ahora = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return ahora.toISOString().slice(0, 10);
}

export default async function LibroInventariosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");

  const { fecha } = await searchParams;
  const fechaSel = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyCR();
  const filas = await libroInventarios(fechaSel);
  const total = filas.reduce((s, f) => s + f.valor, 0);

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Libro de Inventarios</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Detalle valuado por ítem a una fecha. Es la mitad diferida del libro legal
        de Inventarios y Balances.
      </p>

      <form method="GET" className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-neutral-500">Al corte del</label>
          <input
            type="date"
            name="fecha"
            defaultValue={fechaSel}
            className="mt-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Generar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[680px] text-sm">
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
                  Sin existencias valuadas a esa fecha.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={`${f.articulo_codigo}-${f.bodega_codigo}-${i}`}>
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
                  Total valorado al {fechaSel}
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
