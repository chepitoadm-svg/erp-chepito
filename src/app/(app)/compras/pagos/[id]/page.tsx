import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerPago, medioLabel } from "@/lib/data/compras";
import { confirmarPago } from "../../actions";
import AnularPago from "@/components/AnularPago";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function PagoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("compras.pagar"))) redirect("/compras");
  const { id } = await params;
  const p = await obtenerPago(id);
  if (!p) notFound();

  return (
    <div>
      <Link href="/compras/pagos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Pagos
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{p.proveedor_nombre}</h1>
          <p className="text-sm text-neutral-500">
            {p.fecha} · {medioLabel(p.medio_pago)} · {p.cuenta_codigo} {p.cuenta_nombre}
            {p.referencia ? ` · ref. ${p.referencia}` : ""}
          </p>
          {p.glosa && <p className="text-xs text-neutral-400">{p.glosa}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[p.estado]}`}>{p.estado}</span>
      </div>

      {p.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${p.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {p.asiento_numero ? `#${p.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Factura</th>
              <th className="px-4 py-3 text-right font-medium">Abonado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {p.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3">
                  {l.factura_id ? (
                    <Link
                      href={`/compras/facturas/${l.factura_id}`}
                      className="font-mono text-xs text-neutral-600 underline hover:text-neutral-900"
                    >
                      {l.factura_clave ?? "ver factura"}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-neutral-500">{l.factura_clave ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(l.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="px-4 py-3 text-right font-medium text-neutral-700">Total</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(p.monto_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {p.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarPago}>
            <input type="hidden" name="id" value={p.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Postea Debe CxP / Haber {p.cuenta_codigo} y baja el saldo de las facturas.
          </span>
        </div>
      )}

      {p.estado === "confirmado" && (
        <div className="mt-6">
          <AnularPago id={p.id} />
        </div>
      )}
    </div>
  );
}
