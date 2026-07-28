import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  conciliacionInicial,
  listarCargasIniciales,
  listarArticulosParaSelector,
  listarBodegas,
} from "@/lib/data/inventario";
import CargaInicialForm from "@/components/CargaInicialForm";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CargaInicialPage() {
  if (!(await tienePermiso("inventario.ajustar"))) redirect("/inventario");

  const [conc, cargas, articulos, bodegas] = await Promise.all([
    conciliacionInicial(),
    listarCargasIniciales(),
    listarArticulosParaSelector(),
    listarBodegas(),
  ]);
  const cuadra = Math.abs(conc.diferencia) < 0.005;

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Carga inicial de existencias</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Ingresa cantidad y costo al arranque. No postea asiento: el valor ya vive
        en el asiento de apertura del 30/06.
      </p>

      {/* Panel de conciliación contra la apertura */}
      <div
        className={`mb-6 rounded-lg border p-4 ${
          cuadra ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Kardex inicial</div>
            <div className="text-lg font-semibold tabular-nums text-neutral-900">
              {fmt(conc.valor_kardex_inicial)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Inventario en la apertura
            </div>
            <div className="text-lg font-semibold tabular-nums text-neutral-900">
              {fmt(conc.valor_apertura_contable)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Diferencia</div>
            <div
              className={`text-lg font-semibold tabular-nums ${
                cuadra ? "text-green-700" : "text-amber-700"
              }`}
            >
              {fmt(conc.diferencia)}
            </div>
          </div>
        </div>
        <p className={`mt-2 text-sm ${cuadra ? "text-green-700" : "text-amber-700"}`}>
          {cuadra
            ? "✓ La carga inicial cuadra con el asiento de apertura."
            : "Aún no cuadra: la suma de cargas iniciales debe igualar el saldo de 11-60 en la apertura."}
        </p>
      </div>

      <div className="mb-6">
        <CargaInicialForm articulos={articulos} bodegas={bodegas} />
      </div>

      <h2 className="mb-2 text-sm font-medium text-neutral-800">Cargas registradas</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cargas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay cargas iniciales.
                </td>
              </tr>
            )}
            {cargas.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-neutral-600">{m.fecha}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">{m.articulo_codigo}</td>
                <td className="px-4 py-3 text-neutral-900">{m.articulo_nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{m.bodega_codigo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(m.cantidad)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(m.costo_unitario)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                  {fmt(m.costo_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
