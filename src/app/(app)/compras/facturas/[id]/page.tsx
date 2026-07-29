import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerFactura } from "@/lib/data/compras";
import { confirmarFactura } from "../../actions";
import AnularFactura from "@/components/AnularFactura";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};
const COND: Record<string, string> = { "01": "Contado", "02": "Crédito" };

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const { id } = await params;
  const f = await obtenerFactura(id);
  if (!f) notFound();

  return (
    <div>
      <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Facturas
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{f.proveedor_nombre}</h1>
          <p className="text-sm text-neutral-500">
            Emisión {f.fecha_emision}
            {f.fecha_vencimiento ? ` · vence ${f.fecha_vencimiento}` : ""}
            {f.condicion_venta ? ` · ${COND[f.condicion_venta] ?? f.condicion_venta}` : ""}
          </p>
          <p className="text-xs text-neutral-400">
            Céd. {f.proveedor_cedula}
            {f.clave ? ` · clave ${f.clave}` : ""}
            {f.bodega_codigo ? ` · ingresa a ${f.bodega_codigo}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[f.estado]}`}>
          {f.estado}
        </span>
      </div>

      {f.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${f.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {f.asiento_numero ? `#${f.asiento_numero}` : "ver"}
          </Link>
          {f.cxp_saldo != null && (
            <span className="ml-3">
              CxP: saldo {fmt(f.cxp_saldo)} ({f.cxp_estado})
            </span>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
              <th className="px-4 py-3 text-right font-medium">Base</th>
              <th className="px-4 py-3 font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">IVA ₡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {f.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                  {l.articulo_nombre}
                  {l.codigo_comercial && (
                    <span className="block text-xs text-neutral-400">
                      cód. proveedor {l.codigo_comercial}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.costo_unitario)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.base_imponible)}
                </td>
                <td className="px-4 py-3 text-neutral-600">{l.iva_codigo ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.iva_monto)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right text-neutral-500">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{fmt(f.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right text-neutral-500">
                IVA
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{fmt(f.iva_total)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right font-medium text-neutral-700">
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(f.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {f.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarFactura}>
            <input type="hidden" name="id" value={f.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Ingresa la mercadería, postea el asiento y crea la cuenta por pagar.
          </span>
        </div>
      )}

      {f.estado === "confirmada" && (
        <div className="mt-6">
          <AnularFactura id={f.id} />
        </div>
      )}
    </div>
  );
}
