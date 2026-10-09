import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  calcularAplicacionProduccion,
  listarAplicaciones,
  listarBodegas,
} from "@/lib/data/produccionAplicacion";
import AplicarProduccionBtn from "@/components/AplicarProduccionBtn";
import { aplicarProduccion, anularAplicacion } from "../actions";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number, d = 3) => n.toLocaleString("es-CR", { maximumFractionDigits: d });

function mesActual(): { ini: string; fin: string } {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }));
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fin = new Date(y, m + 1, 0).getDate();
  return { ini: `${y}-${pad(m + 1)}-01`, fin: `${y}-${pad(m + 1)}-${pad(fin)}` };
}

export default async function AplicarProduccionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; bodega?: string; ok?: string }>;
}) {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");
  const sp = await searchParams;
  const def = mesActual();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = re.test(sp.desde ?? "") ? sp.desde! : def.ini;
  const hasta = re.test(sp.hasta ?? "") ? sp.hasta! : def.fin;

  const [bodegas, aplicaciones] = await Promise.all([listarBodegas(), listarAplicaciones()]);
  const bodegaDef = bodegas.find((b) => b.codigo === "MP") ?? bodegas[0];
  const bodegaId = sp.bodega && bodegas.some((b) => b.id === sp.bodega) ? sp.bodega : bodegaDef?.id ?? "";

  let prev: Awaited<ReturnType<typeof calcularAplicacionProduccion>> | null = null;
  let error: string | null = null;
  try {
    prev = await calcularAplicacionProduccion(desde, hasta);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la producción.";
  }
  const totalValor = prev ? prev.lineas.reduce((a, l) => a + l.valor, 0) : 0;

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Descontar producción del inventario</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Toma la producción que las dependientas anotan en la app vieja, explota las recetas y{" "}
        <b>descuenta la materia prima del inventario</b> (sin asiento: el costo ya se contó al comprar).
        Solo baja el stock de los insumos que convertiste a artículos del inventario.
      </p>

      {sp.ok === "1" && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Producción descontada del inventario.
        </div>
      )}

      {/* Período + bodega (GET: recalcula la vista previa) */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Bodega de MP</span>
          <select name="bodega" defaultValue={bodegaId} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm">
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>{b.nombre}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          Ver
        </button>
      </form>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {prev && (
        <>
          <h2 className="mt-2 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Se descontará ({prev.lineas.length} artículos)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Artículo</th>
                  <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-3 text-right font-medium">Costo prom.</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {prev.lineas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                      Nada ligado al inventario en este período (convertí insumos a artículos para que se descuenten).
                    </td>
                  </tr>
                )}
                {prev.lineas.map((l) => (
                  <tr key={l.articulo_id}>
                    <td className="px-4 py-3 text-neutral-900">{l.articulo_nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-800">
                      {num(l.cantidad)} {l.unidad_stock.toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{money(l.costo_promedio)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{money(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
              {prev.lineas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                    <td className="px-4 py-3" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(totalValor)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {prev.noLigados.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <b>{prev.noLigados.length} insumos NO se descuentan</b> porque todavía no están ligados al inventario:{" "}
              {prev.noLigados.slice(0, 8).map((n) => n.nombre).join(", ")}
              {prev.noLigados.length > 8 ? "…" : ""}.{" "}
              <Link href="/produccion" className="underline">Convertilos a artículos</Link> para que bajen stock.
            </div>
          )}

          <p className="mt-2 text-xs text-neutral-400">{prev.filas_leidas.toLocaleString("es-CR")} filas de producción leídas de la app vieja.</p>

          <AplicarProduccionBtn
            action={aplicarProduccion}
            desde={desde}
            hasta={hasta}
            bodegaId={bodegaId}
            disabled={prev.lineas.length === 0}
          />
        </>
      )}

      {/* Aplicaciones hechas */}
      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Descuentos hechos
      </h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {aplicaciones.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">Todavía no has descontado ningún período.</td>
              </tr>
            )}
            {aplicaciones.map((a) => (
              <tr key={a.id} className={a.estado === "anulada" ? "opacity-50" : ""}>
                <td className="px-4 py-3 text-neutral-900">{a.desde} a {a.hasta}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      a.estado === "aplicada"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {a.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {a.estado === "aplicada" ? (
                    <form action={anularAplicacion}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-red-600 hover:text-red-800">
                        Anular (devuelve el stock)
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
