import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPagos, medioLabel } from "@/lib/data/compras";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function PagosPage() {
  if (!(await tienePermiso("compras.pagar"))) redirect("/compras");
  const pagos = await listarPagos();

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Pagos a proveedores</h1>
          <p className="text-sm text-neutral-500">
            Registrar pagos de facturas: baja la cuenta por pagar y sale de caja o banco.
          </p>
        </div>
        <Link
          href="/compras/pagos/nuevo"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo pago
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Medio</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pagos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay pagos.
                </td>
              </tr>
            )}
            {pagos.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-neutral-600">{p.fecha}</td>
                <td className="px-4 py-3 text-neutral-900">{p.proveedor_nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{medioLabel(p.medio_pago)}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">{p.cuenta_codigo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(p.monto_total)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[p.estado]}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/compras/pagos/${p.id}`} className="text-neutral-600 hover:text-neutral-900">
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
