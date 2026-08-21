import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFacturas, listarProveedoresDeFacturas, type FacturasFiltro } from "@/lib/data/compras";
import { listarCentrosCosto } from "@/lib/data/asientos";
import { numeroFactura } from "@/lib/compras/numeroFactura";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

type SP = { proveedor?: string; desde?: string; hasta?: string; centro?: string; estado?: string };

export default async function FacturasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const sp = await searchParams;

  const filtro: FacturasFiltro = {
    proveedorId: sp.proveedor || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    centroId: sp.centro || undefined,
    estado: (sp.estado as FacturasFiltro["estado"]) || undefined,
  };
  const hayFiltro = !!(filtro.proveedorId || filtro.desde || filtro.hasta || filtro.centroId || filtro.estado);

  const [facturas, proveedores, centros] = await Promise.all([
    listarFacturas(filtro),
    listarProveedoresDeFacturas(),
    listarCentrosCosto(),
  ]);

  const total = facturas.reduce((s, f) => s + (f.estado === "anulada" ? 0 : f.total), 0);

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Facturas de compra</h1>
          <p className="text-sm text-neutral-500">
            Registrar la factura del proveedor: trae la mercadería y crea la cuenta por pagar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras/facturas/nueva-gasto"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            + Gasto
          </Link>
          <Link
            href="/compras/facturas/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Compra (inventario)
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Proveedor
          <select
            name="proveedor"
            defaultValue={sp.proveedor ?? ""}
            className="min-w-[200px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Centro de costo
          <select
            name="centro"
            defaultValue={sp.centro ?? ""}
            className="min-w-[160px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado
          <select
            name="estado"
            defaultValue={sp.estado ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            <option value="confirmada">Confirmada</option>
            <option value="borrador">Borrador</option>
            <option value="anulada">Anulada</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Filtrar
          </button>
          {hayFiltro && (
            <Link
              href="/compras/facturas"
              className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Emisión</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Factura</th>
              <th className="px-4 py-3 font-medium">Centro</th>
              <th className="px-4 py-3 text-right font-medium">Líneas</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {facturas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  {hayFiltro ? "Ninguna factura coincide con los filtros." : "Todavía no hay facturas."}
                </td>
              </tr>
            )}
            {facturas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 text-neutral-600">{f.fecha_emision}</td>
                <td className="px-4 py-3 text-neutral-900">{f.proveedor_nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {numeroFactura(f.clave) ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {f.centro_codigo ? (
                    <span title={f.centro_nombre ?? ""}>{f.centro_codigo}</span>
                  ) : (
                    <span className="text-neutral-300">— inventario</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{f.n_lineas}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(f.total)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[f.estado]}`}>
                    {f.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/compras/facturas/${f.id}`}
                    className="text-neutral-600 hover:text-neutral-900"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {facturas.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-700">
              <tr>
                <td className="px-4 py-2" colSpan={5}>
                  {facturas.length} factura{facturas.length !== 1 ? "s" : ""} (sin anuladas)
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(total)}</td>
                <td className="px-4 py-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
