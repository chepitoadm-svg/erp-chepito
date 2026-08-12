import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { consumoMateriaPrima } from "@/lib/data/produccion";
import { familiaBase } from "@/lib/produccion/gasto";

function fmtQty(base: number, unidad: string): string {
  const fam = familiaBase(unidad);
  const n = (x: number, d = 3) => x.toLocaleString("es-CR", { maximumFractionDigits: d });
  if (fam === "peso") return n(base / 1000) + " kg";
  if (fam === "volumen") return n(base / 1000) + " L";
  return n(base, 2) + " u";
}

function mesActual(): { ini: string; fin: string } {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }));
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fin = new Date(y, m + 1, 0).getDate();
  return { ini: `${y}-${pad(m + 1)}-01`, fin: `${y}-${pad(m + 1)}-${pad(fin)}` };
}

export default async function ConsumoMpPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const sp = await searchParams;
  const def = mesActual();
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? sp.desde! : def.ini;
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta ?? "") ? sp.hasta! : def.fin;

  let data: Awaited<ReturnType<typeof consumoMateriaPrima>> | null = null;
  let error: string | null = null;
  try {
    data = await consumoMateriaPrima(ini, fin);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la producción.";
  }

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Consumo de materia prima</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Materia prima consumida por la producción (leída de tu app de producción, solo lectura). Es
        la salida de inventario del método perpetuo. Mismos números que la pestaña “Gasto materia
        prima”.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Desde</span>
          <input type="date" name="desde" defaultValue={ini} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={fin} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          Aplicar
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Materia prima</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium">Consumo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.insumos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">
                      No hay producción en ese rango.
                    </td>
                  </tr>
                )}
                {data.insumos.map((i) => (
                  <tr key={i.insumo_id}>
                    <td className="px-4 py-3 text-neutral-900">{i.nombre}</td>
                    <td className="px-4 py-3 text-neutral-500">{i.proveedor || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-800">
                      {fmtQty(i.base_qty, i.unidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            {data.insumos.length} insumos · {data.filas_leidas.toLocaleString("es-CR")} filas de
            producción leídas
            {data.sin_receta.length > 0 && (
              <>
                {" · "}
                {data.sin_receta.length} productos sin receta (excluidos, igual que la app):{" "}
                {data.sin_receta.slice(0, 6).map((s) => s.nombre).join(", ")}
                {data.sin_receta.length > 6 ? "…" : ""}
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
