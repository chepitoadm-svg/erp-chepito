import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarArticulosParaSelector, listarKardex } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPO_ETIQUETA: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  ajuste_pos: "Ajuste (+)",
  ajuste_neg: "Ajuste (−)",
  ajuste_valor: "Ajuste de valor",
  transferencia_envio: "Transferencia (envío)",
  transferencia_recepcion: "Transferencia (recepción)",
  recepcion: "Recepción de compra",
  factura_compra: "Factura de compra",
  devolucion_compra: "Devolución de compra",
};

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<{ articulo?: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");

  const { articulo } = await searchParams;
  const articulos = await listarArticulosParaSelector();
  const seleccionado = articulo && articulos.some((a) => a.id === articulo) ? articulo : "";
  const movimientos = seleccionado ? await listarKardex(seleccionado) : [];

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Kardex</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Cada movimiento del artículo, con la existencia y el promedio resultantes.
      </p>

      <form method="GET" className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs text-neutral-500">Artículo</label>
          <select
            name="articulo"
            defaultValue={seleccionado}
            className="mt-1 w-80 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Seleccioná un artículo…</option>
            {articulos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} — {a.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Ver kardex
        </button>
      </form>

      {seleccionado && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Bodega</th>
                <th className="px-4 py-3 font-medium">Movimiento</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
                <th className="px-4 py-3 text-right font-medium">Costo total</th>
                <th className="px-4 py-3 text-right font-medium">Existencia</th>
                <th className="px-4 py-3 text-right font-medium">Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                    Este artículo todavía no tiene movimientos.
                  </td>
                </tr>
              )}
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-neutral-600">{m.fecha}</td>
                  <td className="px-4 py-3 text-neutral-600">{m.bodega_codigo}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {TIPO_ETIQUETA[m.tipo] ?? m.tipo}
                    {m.detalle && (
                      <span className="block text-xs text-neutral-400">{m.detalle}</span>
                    )}
                  </td>
                  <td
                    className={
                      "px-4 py-3 text-right tabular-nums " +
                      (m.cantidad < 0 ? "text-red-600" : "text-neutral-700")
                    }
                  >
                    {fmt(m.cantidad)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {fmt(m.costo_unitario)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {fmt(m.costo_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                    {fmt(m.existencia_despues)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {fmt(m.promedio_despues)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
