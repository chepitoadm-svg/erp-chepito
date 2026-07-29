import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerDevolucion } from "@/lib/data/compras";
import { confirmarDevolucion } from "../../actions";
import AnularDevolucion from "@/components/AnularDevolucion";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function DevolucionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const { id } = await params;
  const d = await obtenerDevolucion(id);
  if (!d) notFound();

  return (
    <div>
      <Link href="/compras/devoluciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Devoluciones
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{d.proveedor_nombre}</h1>
          <p className="text-sm text-neutral-500">
            {d.fecha} · {d.motivo} · sale de {d.bodega_codigo}
          </p>
          {d.factura_id && (
            <p className="text-xs text-neutral-400">
              De la factura{" "}
              <Link href={`/compras/facturas/${d.factura_id}`} className="underline">
                {d.factura_clave ?? "ver"}
              </Link>
            </p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[d.estado]}`}>
          {d.estado}
        </span>
      </div>

      {d.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${d.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {d.asiento_numero ? `#${d.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Base</th>
              <th className="px-4 py-3 text-right font-medium">IVA ₡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {d.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                  {l.articulo_nombre}
                  {l.detalle && <span className="block text-xs text-neutral-400">{l.detalle}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.base_imponible)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.iva_monto)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-neutral-500">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{fmt(d.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-neutral-500">
                IVA
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{fmt(d.iva_total)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right font-medium text-neutral-700">
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(d.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {d.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarDevolucion}>
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Baja el inventario al promedio, revierte el IVA y baja la CxP.
          </span>
        </div>
      )}

      {d.estado === "confirmada" && (
        <div className="mt-6">
          <AnularDevolucion id={d.id} />
        </div>
      )}
    </div>
  );
}
