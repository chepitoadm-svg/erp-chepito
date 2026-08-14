import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarVentasDia } from "@/lib/data/ventas";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function VentasPage() {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/");
  const ventas = await listarVentasDia();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Ventas del día</h1>
          <p className="text-sm text-neutral-500">
            Lo vendido por negocio (gravado, exento e IVA). Postea la venta al mayor por centro de
            costo.
          </p>
        </div>
        <Link
          href="/ventas/nueva"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nueva venta
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 text-right font-medium">Gravado</th>
              <th className="px-4 py-3 text-right font-medium">Exento</th>
              <th className="px-4 py-3 text-right font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ventas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay ventas registradas.
                </td>
              </tr>
            )}
            {ventas.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3 text-neutral-600">{v.fecha}</td>
                <td className="px-4 py-3 text-neutral-800">{v.centro_codigo ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.gravado)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.exento)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(v.iva)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                  {fmt(v.total)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[v.estado]}`}>
                    {v.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/ventas/${v.id}`} className="text-neutral-600 hover:text-neutral-900">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
