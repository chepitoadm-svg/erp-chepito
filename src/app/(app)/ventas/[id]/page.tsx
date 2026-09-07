import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerVentaDia } from "@/lib/data/ventas";
import { confirmarVentaDia } from "../actions";
import AnularVentaDia from "@/components/AnularVentaDia";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function VentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/");
  const { id } = await params;
  const v = await obtenerVentaDia(id);
  if (!v) notFound();

  const filas: [string, number][] = [
    ["Venta gravada", v.gravado],
    ["Venta exenta", v.exento],
    ["IVA cobrado", v.iva],
  ];

  return (
    <div>
      <Link href="/ventas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ventas
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Venta {v.centro_codigo} — {fechaCR(v.fecha)}
          </h1>
          <p className="text-sm text-neutral-500">{v.centro_nombre}</p>
          {v.glosa && <p className="text-xs text-neutral-400">{v.glosa}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[v.estado]}`}>{v.estado}</span>
      </div>

      {v.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${v.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {v.asiento_numero ? `#${v.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="max-w-md overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {filas.map(([label, monto]) => (
              <tr key={label}>
                <td className="px-4 py-3 text-neutral-600">{label}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="px-4 py-3 font-medium text-neutral-700">Total cobrado</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(v.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cómo se cobró (medios de pago) */}
      <div className="mt-4 max-w-md overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Cómo se cobró
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            <tr className="bg-emerald-50/40">
              <td className="px-4 py-3 text-emerald-800">💳 Tarjeta (datafono)</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-800">{fmt(v.tarjeta)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">💵 Efectivo (caja)</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(v.efectivo)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">📲 Sinpe</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(v.sinpe)}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          La tarjeta entra al <b>datafono</b> (cuenta por cobrar), no a caja: el banco lo deposita después y ahí se
          concilia.
        </p>
      </div>

      {v.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarVentaDia}>
            <input type="hidden" name="id" value={v.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Debe Datafono/Caja/Sinpes / Haber Ventas ({v.centro_codigo}) + IVA.
          </span>
        </div>
      )}

      {v.estado === "confirmado" && (
        <div className="mt-6">
          <AnularVentaDia id={v.id} />
        </div>
      )}
    </div>
  );
}
