import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerCierre } from "@/lib/data/inventario";
import { confirmarCierre } from "../../actions";
import AnularCierre from "@/components/AnularCierre";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function CierreDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const { id } = await params;
  const [c, puedeAjustar] = await Promise.all([obtenerCierre(id), tienePermiso("inventario.ajustar")]);
  if (!c) notFound();

  return (
    <div>
      <Link href="/inventario/cierre" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Cierres
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Cierre {c.bodega_codigo} — {c.fecha}
          </h1>
          <p className="text-sm text-neutral-500">
            {c.bodega_nombre}
            {c.centro_codigo ? ` · centro ${c.centro_codigo}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[c.estado]}`}>{c.estado}</span>
      </div>

      {c.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${c.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {c.asiento_numero ? `#${c.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Dato label="Valor teórico" valor={fmt(c.valor_teorico)} />
        <Dato label="Valor físico (contado)" valor={fmt(c.valor_fisico)} />
        <Dato
          label="Diferencia (faltante si negativa)"
          valor={fmt(c.diferencia)}
          rojo={c.diferencia < 0}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Teórico</th>
              <th className="px-4 py-3 text-right font-medium">Físico</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
              <th className="px-4 py-3 text-right font-medium">Valor físico</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {c.lineas.map((l) => {
              const dif = l.valor_fisico - l.valor_teorico;
              return (
                <tr key={l.linea}>
                  <td className="px-4 py-3 text-neutral-900">
                    <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                    {l.articulo_nombre}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {fmt(l.cantidad_teorica)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {fmt(l.cantidad_fisica)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                    {fmt(l.costo_promedio)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {fmt(l.valor_fisico)}
                  </td>
                  <td
                    className={
                      "px-4 py-3 text-right tabular-nums " +
                      (dif < 0 ? "text-red-600" : dif > 0 ? "text-amber-700" : "text-neutral-400")
                    }
                  >
                    {fmt(dif)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeAjustar && c.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarCierre}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Ajusta Inventario contra el cierre anterior y deja el kardex igual al conteo.
          </span>
        </div>
      )}

      {puedeAjustar && c.estado === "confirmado" && (
        <div className="mt-6">
          <AnularCierre id={c.id} />
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor, rojo }: { label: string; valor: string; rojo?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${rojo ? "text-red-600" : "text-neutral-900"}`}>
        {valor}
      </div>
    </div>
  );
}
