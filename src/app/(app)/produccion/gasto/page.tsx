import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { consumoMateriaPrima } from "@/lib/data/produccion";
import GastoInsumos from "@/components/GastoInsumos";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 0 });

function hoyCR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

export default async function GastoMpPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  if (!(await tienePermiso("produccion.ver"))) redirect("/produccion");
  const sp = await searchParams;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const hoy = hoyCR();
  const desde = re.test(sp.desde ?? "") ? sp.desde! : hoy;
  const hasta = re.test(sp.hasta ?? "") ? sp.hasta! : desde;

  let data: Awaited<ReturnType<typeof consumoMateriaPrima>> | null = null;
  let error: string | null = null;
  try {
    data = await consumoMateriaPrima(desde, hasta);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la producción.";
  }
  const unidades = data ? data.por_producto.reduce((a, p) => a + p.unidades, 0) : 0;

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Gasto en materia prima</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Cuánto costó en materia prima producir, y <b>en qué se gastó</b> — por producto y por insumo.
        Sale de la producción (app vieja) × las recetas del ERP. Es informativo, no toca inventario.
      </p>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          Ver
        </button>
      </form>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          <div className="mb-5 inline-flex flex-wrap gap-6 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Gasto de materia prima</div>
              <div className="text-2xl font-bold text-amber-800">{money0(data.total_colones)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Unidades producidas</div>
              <div className="text-2xl font-bold text-neutral-800">{unidades.toLocaleString("es-CR")}</div>
            </div>
          </div>

          {/* POR PRODUCTO */}
          <h2 className="mt-2 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Costo por producto (unidades × receta)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 text-right font-medium">Unidades</th>
                  <th className="px-4 py-3 text-right font-medium">₡ por unidad</th>
                  <th className="px-4 py-3 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.por_producto.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No hay producción en ese rango.</td>
                  </tr>
                )}
                {data.por_producto.map((p) => (
                  <tr key={p.nombre}>
                    <td className="px-4 py-3 text-neutral-900">{p.nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{p.unidades.toLocaleString("es-CR")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{money(p.costo_unit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{money(p.costo_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* POR INSUMO (expandible: tocá para ver en qué productos se gastó) */}
          <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            En qué se gastó (por insumo)
          </h2>
          <p className="mb-2 text-xs text-neutral-400">Tocá una materia prima para ver en cuáles productos se gastó.</p>
          <GastoInsumos insumos={data.insumos} />

          <p className="mt-3 text-xs text-neutral-400">
            {data.filas_leidas.toLocaleString("es-CR")} filas de producción leídas
            {data.sin_receta.length > 0 && (
              <> · {data.sin_receta.length} productos sin receta (excluidos): {data.sin_receta.slice(0, 6).map((s) => s.nombre).join(", ")}{data.sin_receta.length > 6 ? "…" : ""}</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
