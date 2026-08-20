import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerCostoMes } from "@/lib/data/costoProduccion";
import { confirmarCostoMes } from "../actions";
import AnularCostoMes from "@/components/AnularCostoMes";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function CostoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("costos.registrar"))) redirect("/");
  const { id } = await params;
  const c = await obtenerCostoMes(id);
  if (!c) notFound();
  const hayHuecos = c.lineas.some((l) => l.sin_receta > 0);
  const variacion = Math.round((c.total - c.consumo_teorico) * 100) / 100;

  return (
    <div>
      <Link href="/costos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Costo de ventas
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Costo de ventas — {c.periodo.slice(0, 7)}</h1>
          <p className="text-sm text-neutral-500">Consumo de materia prima por panadería.</p>
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

      <div className="max-w-2xl overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Panadería</th>
              <th className="px-4 py-3 text-right font-medium">Consumo teórico</th>
              <th className="px-4 py-3 text-right font-medium">Costo real (prorrateado)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {c.lineas.map((l) => (
              <tr key={l.centro_codigo}>
                <td className="px-4 py-3 text-neutral-800">
                  {l.centro_codigo} — {l.centro_nombre}
                  {l.sin_receta > 0 && (
                    <span className="ml-1 text-[10px] text-amber-600">· {fmt(l.sin_receta)} u sin receta</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{fmt(l.consumo_teorico)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{fmt(l.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="px-4 py-3 font-medium text-neutral-700">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{fmt(c.consumo_teorico)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{fmt(c.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        className={`mt-3 max-w-2xl rounded-md border px-3 py-2 text-sm ${
          Math.abs(variacion) < 0.005
            ? "border-neutral-200 bg-neutral-50 text-neutral-600"
            : variacion > 0
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
        }`}
      >
        <b>Control:</b> MP comprada ₡{fmt(c.total)} vs consumo teórico ₡{fmt(c.consumo_teorico)}.{" "}
        {variacion > 0.005
          ? `Compraste ₡${fmt(variacion)} de más (posible desperdicio/robo/stock).`
          : variacion < -0.005
            ? `Compraste ₡${fmt(-variacion)} menos (se usó inventario o las recetas sobrestiman).`
            : "Calza con lo esperado."}
      </div>

      {hayHuecos && (
        <p className="mt-3 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Hay pan producido sin receta en el app; no cuenta en el consumo teórico, así que el reparto entre
          panaderías puede quedar corrido. Se corrige completando esas recetas.
        </p>
      )}

      {c.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarCostoMes}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Debe 51-30-01-03 Costo de ventas (por centro) / Haber 11-60-01 Inventario.
          </span>
        </div>
      )}

      {c.estado === "confirmado" && (
        <div className="mt-6">
          <AnularCostoMes id={c.id} />
        </div>
      )}
    </div>
  );
}
