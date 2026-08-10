import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerDesecho, motivoDesechoLabel } from "@/lib/data/inventario";
import { confirmarDesecho } from "../../actions";
import AnularDesecho from "@/components/AnularDesecho";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function DesechoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const { id } = await params;
  const [d, puedeAjustar] = await Promise.all([obtenerDesecho(id), tienePermiso("inventario.ajustar")]);
  if (!d) notFound();

  return (
    <div>
      <Link href="/inventario/desechos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Desechos
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Desecho {d.centro_codigo} — {d.fecha}
          </h1>
          <p className="text-sm text-neutral-500">
            {d.centro_nombre} · {motivoDesechoLabel[d.motivo]}
          </p>
          {d.glosa && <p className="text-xs text-neutral-400">{d.glosa}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[d.estado]}`}>{d.estado}</span>
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
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {d.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3 text-neutral-900">{l.descripcion}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(l.cantidad)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {fmt(l.costo_unitario)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(l.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-neutral-500">
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(d.valor_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {puedeAjustar && d.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarDesecho}>
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Postea Debe 51-30-01-02 / Haber 51-10-02 en {d.centro_codigo}.
          </span>
        </div>
      )}

      {puedeAjustar && d.estado === "confirmado" && (
        <div className="mt-6">
          <AnularDesecho id={d.id} />
        </div>
      )}
    </div>
  );
}
