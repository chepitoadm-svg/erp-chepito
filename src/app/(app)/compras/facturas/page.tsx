import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFacturas } from "@/lib/data/compras";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function FacturasPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const facturas = await listarFacturas();

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

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Emisión</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Clave</th>
              <th className="px-4 py-3 text-right font-medium">Líneas</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {facturas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay facturas.
                </td>
              </tr>
            )}
            {facturas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 text-neutral-600">{f.fecha_emision}</td>
                <td className="px-4 py-3 text-neutral-900">{f.proveedor_nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {f.clave ?? "—"}
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
        </table>
      </div>
    </div>
  );
}
