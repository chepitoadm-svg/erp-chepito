import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerAjuste } from "@/lib/data/inventario";
import { confirmarAjuste } from "../../actions";
import AnularAjuste from "@/components/AnularAjuste";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function AjusteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const { id } = await params;
  const [ajuste, puedeAjustar] = await Promise.all([
    obtenerAjuste(id),
    tienePermiso("inventario.ajustar"),
  ]);
  if (!ajuste) notFound();

  return (
    <div>
      <Link href="/inventario/ajustes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ajustes
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Ajuste — {ajuste.bodega_codigo}
          </h1>
          <p className="text-sm text-neutral-500">
            {ajuste.fecha} · {ajuste.motivo}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[ajuste.estado]}`}>
          {ajuste.estado}
        </span>
      </div>

      {ajuste.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento generado:{" "}
          <Link
            href={`/asientos/${ajuste.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {ajuste.asiento_numero ? `#${ajuste.asiento_numero}` : "ver asiento"}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">Dirección</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ajuste.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                  {l.articulo_nombre}
                </td>
                <td className="px-4 py-3">
                  {l.direccion === "neg" ? (
                    <span className="text-red-600">Merma (−)</span>
                  ) : (
                    <span className="text-green-700">Sobrante (+)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad)}
                </td>
                <td className="px-4 py-3 text-neutral-500">{l.detalle ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeAjustar && ajuste.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarAjuste}>
            <input type="hidden" name="id" value={ajuste.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Postea el asiento (merma/sobrante) y aplica el movimiento al kardex.
          </span>
        </div>
      )}

      {puedeAjustar && ajuste.estado === "confirmado" && (
        <div className="mt-6">
          <AnularAjuste id={ajuste.id} />
        </div>
      )}
    </div>
  );
}
