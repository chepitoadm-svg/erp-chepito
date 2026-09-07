import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fechaCR } from "@/lib/fecha";
import { tienePermiso } from "@/lib/auth/permisos";
import { ventasVexMes, ventasExtMes } from "@/lib/data/ventasExternas";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];
const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  confirmado: "bg-green-50 text-green-700",
  borrador: "bg-amber-50 text-amber-700",
  anulado: "bg-red-50 text-red-600",
};

export default async function VentasExtCierrePage({
  params,
}: {
  params: Promise<{ anio: string; mes: string }>;
}) {
  if (!(await tienePermiso("cierre.gestionar"))) redirect("/");
  const { anio: anioStr, mes: mesStr } = await params;
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound();

  const [ventas, celdas] = await Promise.all([ventasVexMes(anio, mes), ventasExtMes(anio, mes)]);

  const totalDetalle = celdas.reduce((s, c) => s + c.monto, 0);
  const vigentes = ventas.filter((v) => v.estado !== "anulado");
  const totalPosteado = vigentes.filter((v) => v.estado === "confirmado").reduce((s, v) => s + v.total, 0);
  const dif = Math.round((totalDetalle - totalPosteado) * 100) / 100;
  const hayPosteo = vigentes.some((v) => v.estado === "confirmado");

  return (
    <div>
      <div className="mb-4">
        <Link href={`/cierre/${anio}/${mes}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Cierre de {MESES[mes]} {anio}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Ventas externas / mayoreo — control</h1>
        <p className="text-sm text-neutral-500">
          ¿Ya se ingresó (posteó) la venta externa del mes? Cuadrá el detalle por cliente contra lo posteado al
          centro VEX y mirá sus asientos.
        </p>
      </div>

      {/* Cuadre */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Detalle por cliente</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-900">{money(totalDetalle)}</div>
          <Link href={`/ventas/externas?anio=${anio}&mes=${mes}`} className="text-xs text-blue-600 underline hover:text-blue-800">
            Ver / editar detalle →
          </Link>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Posteado (venta VEX)</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-900">{money(totalPosteado)}</div>
          <Link href="/ventas/nueva" className="text-xs text-blue-600 underline hover:text-blue-800">
            Registrar venta VEX →
          </Link>
        </div>
        <div className={`rounded-lg border p-3 ${Math.abs(dif) < 0.005 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="text-xs text-neutral-500">Diferencia</div>
          <div className={`text-lg font-bold tabular-nums ${Math.abs(dif) < 0.005 ? "text-green-700" : "text-amber-700"}`}>
            {Math.abs(dif) < 0.005 ? "Cuadra ✓" : money(dif)}
          </div>
        </div>
      </div>

      {!hayPosteo && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Todavía no hay una venta VEX <strong>posteada</strong> este mes. Registrala en{" "}
          <Link href="/ventas/nueva" className="underline">
            Ventas → Nueva venta
          </Link>{" "}
          (centro Venta externa) para que quede el asiento.
        </div>
      )}

      {/* Ventas VEX posteadas + asientos */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Asiento</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ventas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  No hay ventas VEX registradas este mes.
                </td>
              </tr>
            ) : (
              ventas.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3 text-neutral-600">{fechaCR(v.fecha)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{money(v.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[v.estado]}`}>{v.estado}</span>
                  </td>
                  <td className="px-4 py-3">
                    {v.asiento_id ? (
                      <Link
                        href={`/asientos/${v.asiento_id}?volver=${encodeURIComponent(`/cierre/${anio}/${mes}/ventas-ext`)}&volverLabel=Ventas externas`}
                        className="font-medium text-blue-600 underline hover:text-blue-800"
                      >
                        #{v.asiento_numero}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/ventas/${v.id}`} className="text-neutral-600 hover:text-neutral-900">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
