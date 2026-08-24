import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerNotaCredito } from "@/lib/data/compras";
import AnularNotaCredito from "@/components/AnularNotaCredito";

const fmt = (n: number) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function NotaCreditoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const { id } = await params;
  const n = await obtenerNotaCredito(id);
  if (!n) notFound();
  const editable = n.estado === "confirmada" && !n.aplicada;

  return (
    <div>
      <Link href="/compras/cxp" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Cuentas por pagar
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Nota de crédito — {n.proveedor_nombre}</h1>
          <p className="text-sm text-neutral-500">
            {n.fecha}
            {n.referencia ? ` · ${n.referencia}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {editable && (
            <Link
              href={`/compras/notas-credito/${n.id}/editar`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Editar
            </Link>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[n.estado] ?? "bg-neutral-100 text-neutral-600"}`}>{n.estado}</span>
        </div>
      </div>

      {n.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link href={`/asientos/${n.asiento_id}`} className="font-medium text-neutral-900 underline hover:no-underline">
            {n.asiento_numero ? `#${n.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="max-w-md overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            <tr>
              <td className="px-4 py-3 text-neutral-600">Cuenta</td>
              <td className="px-4 py-3 text-right text-neutral-800">
                {n.cuenta_codigo} — {n.cuenta_nombre}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">Centro</td>
              <td className="px-4 py-3 text-right text-neutral-800">{n.centro_codigo ?? "—"}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">Monto (base)</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(n.subtotal)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">IVA</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(n.iva)}</td>
            </tr>
            {n.glosa && (
              <tr>
                <td className="px-4 py-3 text-neutral-600">Glosa</td>
                <td className="px-4 py-3 text-right text-neutral-600">{n.glosa}</td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="px-4 py-3 font-medium text-neutral-700">Total del crédito</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-green-700">{fmt(n.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {n.estado === "confirmada" && n.aplicada && (
        <p className="mt-3 max-w-md rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este crédito ya se aplicó a un pago, así que no se puede editar ni anular. Para corregirlo, anulá primero el
          pago donde se usó.
        </p>
      )}

      {editable && (
        <div className="mt-6">
          <AnularNotaCredito id={n.id} />
        </div>
      )}
    </div>
  );
}
