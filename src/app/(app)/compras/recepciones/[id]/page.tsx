import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerRecepcion } from "@/lib/data/compras";
import { confirmarRecepcion } from "../../actions";
import AnularRecepcion from "@/components/AnularRecepcion";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function RecepcionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("compras.recibir"))) redirect("/compras");
  const { id } = await params;
  const [r, puedeFacturar] = await Promise.all([
    obtenerRecepcion(id),
    tienePermiso("compras.facturar"),
  ]);
  if (!r) notFound();

  const totalValor = r.lineas.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0);

  return (
    <div>
      <Link href="/compras/recepciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Recepciones
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{r.proveedor_nombre}</h1>
          <p className="text-sm text-neutral-500">
            {r.fecha} · ingresa a {r.bodega_codigo}
            {r.glosa ? ` · ${r.glosa}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.facturada && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">facturada</span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[r.estado]}`}>
            {r.estado}
          </span>
        </div>
      </div>

      {r.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${r.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {r.asiento_numero ? `#${r.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {r.lineas.map((l) => (
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
                  {fmt(l.costo_unitario)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad * l.costo_unitario)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right font-medium text-neutral-700">
                Valor recibido
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(totalValor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {r.estado === "borrador" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action={confirmarRecepcion}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Ingresa la mercadería y postea contra la cuenta puente.
          </span>
          <AnularRecepcion id={r.id} />
        </div>
      )}

      {r.estado === "confirmada" && !r.facturada && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {puedeFacturar && (
            <Link
              href={`/compras/facturas/nueva?recepcion=${r.id}`}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Facturar esta recepción
            </Link>
          )}
          <AnularRecepcion id={r.id} />
        </div>
      )}
    </div>
  );
}
