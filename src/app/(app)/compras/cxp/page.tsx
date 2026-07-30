import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCxP } from "@/lib/data/compras";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  pagada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

function hoyCR(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function CxPPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const puedePagar = await tienePermiso("compras.pagar");
  const cxp = await listarCxP();
  const hoy = hoyCR();
  const totalPendiente = cxp
    .filter((q) => q.estado === "pendiente")
    .reduce((s, q) => s + q.saldo, 0);

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Cuentas por pagar</h1>
          <p className="text-sm text-neutral-500">Saldos con proveedores, por vencimiento.</p>
        </div>
        {puedePagar && (
          <Link
            href="/compras/pagos/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Registrar pago
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Factura</th>
              <th className="px-4 py-3 text-right font-medium">Original</th>
              <th className="px-4 py-3 text-right font-medium">Saldo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cxp.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  No hay cuentas por pagar.
                </td>
              </tr>
            )}
            {cxp.map((q) => {
              const vencida =
                q.estado === "pendiente" && q.fecha_vencimiento && q.fecha_vencimiento < hoy;
              return (
                <tr key={q.id}>
                  <td className="px-4 py-3 text-neutral-600">
                    {q.fecha_vencimiento ?? "—"}
                    {vencida && (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">
                        vencida
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">{q.proveedor_nombre}</td>
                  <td className="px-4 py-3">
                    {q.factura_id ? (
                      <Link
                        href={`/compras/facturas/${q.factura_id}`}
                        className="font-mono text-xs text-neutral-600 underline hover:text-neutral-900"
                      >
                        {q.factura_clave ?? "ver"}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {fmt(q.monto_original)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(q.saldo)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[q.estado] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {q.estado}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {cxp.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-medium text-neutral-700">
                  Total pendiente
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                  {fmt(totalPendiente)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
