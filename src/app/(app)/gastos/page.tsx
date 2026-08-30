import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarGastos,
  listarCentrosDeGastos,
  listarCuentasDeGastos,
  type GastoListado,
} from "@/lib/data/gastos";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

type SP = {
  centro?: string;
  cuenta?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  agrupar?: string;
};

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

export default async function GastosPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const sp = await searchParams;
  const filtro = {
    centro: sp.centro || undefined,
    cuenta: sp.cuenta || undefined,
    estado: sp.estado || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
  };
  const agrupar = sp.agrupar === "centro" || sp.agrupar === "cuenta" || sp.agrupar === "estado" ? sp.agrupar : "";

  const [gastos, centros, cuentas] = await Promise.all([
    listarGastos(filtro),
    listarCentrosDeGastos(),
    listarCuentasDeGastos(),
  ]);

  const hayFiltro = !!(sp.centro || sp.cuenta || sp.estado || sp.desde || sp.hasta);
  const total = gastos.reduce((s, g) => s + g.total, 0);

  // Agrupación: clave y etiqueta por gasto.
  const claveGrupo = (g: GastoListado): string =>
    agrupar === "centro"
      ? g.centro_codigo ?? "—"
      : agrupar === "cuenta"
        ? `${g.cuenta_codigo ?? "—"} · ${g.cuenta_nombre ?? ""}`
        : g.estado;
  const grupos = new Map<string, GastoListado[]>();
  if (agrupar) {
    for (const g of gastos) {
      const k = claveGrupo(g);
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(g);
    }
  }
  const gruposOrd = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const Fila = ({ g }: { g: GastoListado }) => (
    <tr>
      <td className="px-4 py-3 text-neutral-600">{g.fecha}</td>
      <td className="px-4 py-3 text-neutral-800">{g.centro_codigo ?? "—"}</td>
      <td className="px-4 py-3 text-neutral-600">
        {g.cuenta_codigo ? `${g.cuenta_codigo} · ${g.cuenta_nombre}` : "—"}
      </td>
      <td className="px-4 py-3 text-neutral-500">{g.descripcion ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{fmt(g.total)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[g.estado]}`}>{g.estado}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/gastos/${g.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Gastos</h1>
          <p className="text-sm text-neutral-500">
            Gastos del mes por centro de costo (alquiler, servicios, planilla, caja chica…). Alimenta el Estado de
            Resultados por panadería.
          </p>
        </div>
        <Link
          href="/gastos/nuevo"
          className="whitespace-nowrap rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo gasto
        </Link>
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
          Cuenta
          <select name="cuenta" defaultValue={sp.cuenta ?? ""} className={inputCls}>
            <option value="">Todas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
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
            <option value="cuenta">Cuenta</option>
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
          <Link href="/gastos" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Centro</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>

          {gastos.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  {hayFiltro ? "Ningún gasto con esos filtros." : "Todavía no hay gastos registrados."}
                </td>
              </tr>
            </tbody>
          ) : agrupar ? (
            gruposOrd.map(([clave, filas]) => {
              const sub = filas.reduce((s, g) => s + g.total, 0);
              return (
                <tbody key={clave} className="divide-y divide-neutral-100 border-t border-neutral-200">
                  <tr className="bg-neutral-50/70">
                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-800">
                      {clave} <span className="font-normal text-neutral-400">({filas.length})</span>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {fmt(sub)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {filas.map((g) => (
                    <Fila key={g.id} g={g} />
                  ))}
                </tbody>
              );
            })
          ) : (
            <tbody className="divide-y divide-neutral-100">
              {gastos.map((g) => (
                <Fila key={g.id} g={g} />
              ))}
            </tbody>
          )}

          {gastos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">
                  Total ({gastos.length} gasto{gastos.length === 1 ? "" : "s"})
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
