import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerFactura, listarPagosDeFactura, medioLabel } from "@/lib/data/compras";
import { confirmarFactura } from "../../actions";
import AnularFactura from "@/components/AnularFactura";

const PAGO_ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

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

  const pagos = f.estado === "confirmada" ? await listarPagosDeFactura(f.id) : [];
  const abonado = pagos
    .filter((p) => p.estado !== "anulado")
    .reduce((s, p) => s + p.monto, 0);

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
            {f.tipo === "gasto"
              ? " · gasto"
              : f.bodega_codigo
                ? ` · ingresa a ${f.bodega_codigo}`
                : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[f.estado]}`}>
            {f.estado}
          </span>
          {f.tipo === "gasto" && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">gasto</span>
          )}
        </div>
      </div>

      {f.tipo === "gasto" && (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Cuenta de gasto</div>
              <div className="mt-0.5 text-neutral-900">
                <span className="font-mono text-xs text-neutral-600">{f.cuenta_gasto_codigo}</span>{" "}
                {f.cuenta_gasto_nombre}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Centro de costo (negocio)
              </div>
              <div className="mt-0.5 font-medium text-neutral-900">
                {f.centro_codigo} — {f.centro_nombre}
              </div>
            </div>
          </div>
          {f.glosa && <p className="mt-3 text-neutral-600">{f.glosa}</p>}
        </div>
      )}

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

      {f.tipo === "gasto" && (
        <div className="flex justify-end">
          <div className="w-64 space-y-1 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Monto</span>
              <span className="tabular-nums">{fmt(f.subtotal)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>IVA</span>
              <span className="tabular-nums">{fmt(f.iva_total)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
              <span>Total</span>
              <span className="tabular-nums">{fmt(f.total)}</span>
            </div>
          </div>
        </div>
      )}

      {f.tipo === "inventario" && (
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
      )}

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
        <div className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-neutral-800">Pagos aplicados</h2>
            {f.cxp_saldo != null && (
              <span className="text-sm text-neutral-500">
                Abonado {fmt(abonado)} · saldo {fmt(f.cxp_saldo)}{" "}
                <span
                  className={
                    f.cxp_estado === "pagada" ? "text-green-700" : "text-amber-700"
                  }
                >
                  ({f.cxp_estado})
                </span>
              </span>
            )}
          </div>
          {pagos.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
              Esta factura todavía no tiene pagos.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Medio</th>
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                    <th className="px-4 py-3 font-medium">Referencia</th>
                    <th className="px-4 py-3 text-right font-medium">Abonado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pagos.map((p, i) => (
                    <tr key={`${p.pago_id}-${i}`} className={p.estado === "anulado" ? "opacity-50" : ""}>
                      <td className="px-4 py-3 text-neutral-700">{p.fecha}</td>
                      <td className="px-4 py-3 text-neutral-600">{medioLabel(p.medio_pago)}</td>
                      <td className="px-4 py-3 text-neutral-600">
                        <span className="font-mono text-xs">{p.cuenta_codigo}</span> {p.cuenta_nombre}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{p.referencia ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                        {fmt(p.monto)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${PAGO_ESTADO_CLS[p.estado]}`}
                        >
                          {p.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/compras/pagos/${p.pago_id}`}
                          className="text-neutral-600 hover:text-neutral-900"
                        >
                          Ver pago
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {f.tipo === "inventario" && (
              <Link
                href={`/compras/devoluciones/nueva?factura=${f.id}`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Devolver mercadería
              </Link>
            )}
            <AnularFactura id={f.id} />
          </div>
        </div>
      )}
    </div>
  );
}
