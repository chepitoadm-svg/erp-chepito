import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarVentasDia, listarCentrosDeVentas, type VentaDiaListado } from "@/lib/data/ventas";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

type SP = {
  centro?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  agrupar?: string;
};

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

export default async function VentasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/");
  const sp = await searchParams;
  const filtro = {
    centro: sp.centro || undefined,
    estado: sp.estado || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
  };
  const agrupar = sp.agrupar === "centro" || sp.agrupar === "estado" || sp.agrupar === "fecha" ? sp.agrupar : "";

  const [ventas, centros] = await Promise.all([listarVentasDia(filtro), listarCentrosDeVentas()]);

  const hayFiltro = !!(sp.centro || sp.estado || sp.desde || sp.hasta);

  // Totales al pie (las anuladas no suman al total real).
  const vigentes = ventas.filter((v) => v.estado !== "anulado");
  const totGravado = vigentes.reduce((s, v) => s + v.gravado, 0);
  const totExento = vigentes.reduce((s, v) => s + v.exento, 0);
  const totIva = vigentes.reduce((s, v) => s + v.iva, 0);
  const totTotal = vigentes.reduce((s, v) => s + v.total, 0);

  // Agrupación.
  const claveGrupo = (v: VentaDiaListado): string =>
    agrupar === "centro" ? v.centro_codigo ?? "—" : agrupar === "fecha" ? v.fecha : v.estado;
  const grupos = new Map<string, VentaDiaListado[]>();
  if (agrupar) {
    for (const v of ventas) {
      const k = claveGrupo(v);
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(v);
    }
  }
  const gruposOrd = [...grupos.entries()].sort((a, b) =>
    agrupar === "fecha" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]),
  );

  const Fila = ({ v }: { v: VentaDiaListado }) => (
    <tr>
      <td className="px-4 py-3 text-neutral-600">{fechaCR(v.fecha)}</td>
      <td className="px-4 py-3 text-neutral-800">{v.centro_codigo ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.gravado)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.exento)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.iva)}</td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{fmt(v.total)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[v.estado]}`}>{v.estado}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/ventas/${v.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Ventas del día</h1>
          <p className="text-sm text-neutral-500">
            Lo vendido por negocio (gravado, exento e IVA). Postea la venta al mayor por centro de
            costo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ventas/externas"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Ventas externas
          </Link>
          <Link
            href="/ventas/importar"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Importar de QuPOS
          </Link>
          <Link
            href="/ventas/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nueva venta
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Centro
          <select name="centro" defaultValue={sp.centro ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Agrupar por
          <select name="agrupar" defaultValue={agrupar} className={inputCls}>
            <option value="">Sin agrupar</option>
            <option value="centro">Centro</option>
            <option value="fecha">Fecha</option>
            <option value="estado">Estado</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {(hayFiltro || agrupar) && (
          <Link href="/ventas" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 text-right font-medium">Gravado</th>
              <th className="px-4 py-3 text-right font-medium">Exento</th>
              <th className="px-4 py-3 text-right font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>

          {ventas.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  {hayFiltro ? "Ninguna venta con esos filtros." : "Todavía no hay ventas registradas."}
                </td>
              </tr>
            </tbody>
          ) : agrupar ? (
            gruposOrd.map(([clave, filas]) => {
              const vig = filas.filter((v) => v.estado !== "anulado");
              const sub = vig.reduce((s, v) => s + v.total, 0);
              return (
                <tbody key={clave} className="divide-y divide-neutral-100 border-t border-neutral-200">
                  <tr className="bg-neutral-50/70">
                    <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-neutral-800">
                      {clave} <span className="font-normal text-neutral-400">({filas.length})</span>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {fmt(sub)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {filas.map((v) => (
                    <Fila key={v.id} v={v} />
                  ))}
                </tbody>
              );
            })
          ) : (
            <tbody className="divide-y divide-neutral-100">
              {ventas.map((v) => (
                <Fila key={v.id} v={v} />
              ))}
            </tbody>
          )}

          {ventas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-neutral-700">
                  Total vigente ({vigentes.length} venta{vigentes.length === 1 ? "" : "s"})
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(totGravado)}</td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(totExento)}</td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(totIva)}</td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(totTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {ventas.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400">Los totales excluyen las ventas anuladas.</p>
      )}
    </div>
  );
}
