import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { gastoCompleto } from "@/lib/data/produccion";
import GastoInsumos from "@/components/GastoInsumos";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 0 });

function hoyCR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function rangos(hoy: string) {
  const d = new Date(hoy + "T12:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const finMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dow = d.getUTCDay(); // 0=dom
  const lunes = addDays(hoy, dow === 0 ? -6 : 1 - dow);
  return {
    hoy: { desde: hoy, hasta: hoy },
    ayer: { desde: addDays(hoy, -1), hasta: addDays(hoy, -1) },
    semana: { desde: lunes, hasta: addDays(lunes, 6) },
    mes: { desde: `${y}-${pad(m + 1)}-01`, hasta: `${y}-${pad(m + 1)}-${pad(finMes)}` },
  };
}

export default async function GastoMpPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; suc?: string }>;
}) {
  if (!(await tienePermiso("produccion.ver"))) redirect("/produccion");
  const sp = await searchParams;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const hoy = hoyCR();
  const desde = re.test(sp.desde ?? "") ? sp.desde! : hoy;
  const hasta = re.test(sp.hasta ?? "") ? sp.hasta! : desde;
  const suc = sp.suc || "todos";
  const r = rangos(hoy);
  const qs = (d: string, h: string, s = suc) => `?desde=${d}&hasta=${h}&suc=${s}`;
  const esRango = (x: { desde: string; hasta: string }) => x.desde === desde && x.hasta === hasta;

  let data: Awaited<ReturnType<typeof gastoCompleto>> | null = null;
  let error: string | null = null;
  try {
    data = await gastoCompleto(desde, hasta, suc);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la producción.";
  }
  const det = data?.detalle;
  const unidades = det ? det.por_producto.reduce((a, p) => a + p.unidades, 0) : 0;

  const btn = "rounded-md border px-3 py-1.5 text-xs font-medium";
  const btnOn = btn + " border-neutral-900 bg-neutral-900 text-white";
  const btnOff = btn + " border-neutral-300 text-neutral-700 hover:bg-neutral-50";

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Gasto en materia prima</h1>
      <p className="mb-3 max-w-2xl text-sm text-neutral-500">
        Cuánto costó en materia prima producir, y <b>en qué se gastó</b> — por sucursal, por producto y por
        insumo. Sale de la producción (app vieja) × las recetas del ERP. Informativo, no toca inventario.
      </p>

      {/* Período */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={qs(r.hoy.desde, r.hoy.hasta)} className={esRango(r.hoy) ? btnOn : btnOff}>Hoy</Link>
        <Link href={qs(r.ayer.desde, r.ayer.hasta)} className={esRango(r.ayer) ? btnOn : btnOff}>Ayer</Link>
        <Link href={qs(r.semana.desde, r.semana.hasta)} className={esRango(r.semana) ? btnOn : btnOff}>Esta semana</Link>
        <Link href={qs(r.mes.desde, r.mes.hasta)} className={esRango(r.mes) ? btnOn : btnOff}>Este mes</Link>
      </div>
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="suc" value={suc} />
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Ver</button>
      </form>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {data && det && (
        <>
          {/* Tarjetas por sucursal/cliente */}
          <div className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data.cards.map((c) => {
              const activa = (c.key === "todos" && !data.suc) || c.key === data.suc;
              return (
                <Link
                  key={c.key}
                  href={qs(desde, hasta, c.key)}
                  className={
                    "rounded-lg border px-4 py-3 " +
                    (activa ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white hover:bg-neutral-50")
                  }
                >
                  <div className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</div>
                  <div className="text-lg font-bold text-amber-800">{money0(c.total_colones)}</div>
                  <div className="text-xs text-neutral-500">{c.unidades.toLocaleString("es-CR")} unidades</div>
                </Link>
              );
            })}
          </div>

          <p className="mb-3 text-sm text-neutral-500">
            Mostrando: <b className="text-neutral-800">{data.sucLabel}</b> · {money0(det.total_colones)} en materia prima ·{" "}
            {unidades.toLocaleString("es-CR")} unidades con receta
          </p>

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
                {det.por_producto.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No hay producción en ese rango.</td></tr>
                )}
                {det.por_producto.map((p) => (
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

          {/* POR INSUMO (expandible) */}
          <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            En qué se gastó (por insumo)
          </h2>
          <p className="mb-2 text-xs text-neutral-400">Tocá una materia prima para ver en cuáles productos se gastó.</p>
          <GastoInsumos insumos={det.insumos} />

          <p className="mt-3 text-xs text-neutral-400">
            {det.filas_leidas.toLocaleString("es-CR")} filas de producción leídas
            {det.sin_receta.length > 0 && (
              <> · {det.sin_receta.length} productos sin receta (excluidos): {det.sin_receta.slice(0, 6).map((s) => s.nombre).join(", ")}{det.sin_receta.length > 6 ? "…" : ""}</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
