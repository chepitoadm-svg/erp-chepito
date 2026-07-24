import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { balanza } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function BalanzaPage({
  searchParams,
}: {
  searchParams: Promise<{ hasta?: string; solo_hojas?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const hasta = sp.hasta || "2026-07-31";
  const soloHojas = sp.solo_hojas === "si";

  const filas = await balanza(hasta, true);
  const visibles = filas.filter(
    (f) =>
      (Number(f.debitos) !== 0 || Number(f.creditos) !== 0) &&
      (!soloHojas || f.acepta_movimiento),
  );

  // Los totales salen SOLO de las hojas: sumar todos los niveles doble-contaría.
  const hojas = filas.filter((f) => f.acepta_movimiento);
  const totD = hojas.reduce((s, f) => s + Number(f.debitos), 0);
  const totC = hojas.reduce((s, f) => s + Number(f.creditos), 0);
  const cuadra = Math.abs(totD - totC) < 0.01;

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Balanza de comprobación</h1>
      <p className="mb-4 text-sm text-neutral-500">Al {hasta}.</p>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="solo_hojas" value="si" defaultChecked={soloHojas} className="h-4 w-4" />
          <span className="text-neutral-600">Solo cuentas de movimiento</span>
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Aplicar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Cuenta</th>
              <th className="px-3 py-2 text-right font-medium">Débitos</th>
              <th className="px-3 py-2 text-right font-medium">Créditos</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-neutral-500">
                  No hay movimientos confirmados hasta esa fecha.
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr key={f.codigo} className={`border-t border-neutral-100 ${f.acepta_movimiento ? "" : "font-medium text-neutral-800"}`}>
                <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + (f.nivel - 1) * 0.9}rem` }}>
                  <span className="text-neutral-400">{f.codigo}</span> {f.nombre}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                  {Number(f.debitos) ? money(Number(f.debitos)) : ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                  {Number(f.creditos) ? money(Number(f.creditos)) : ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">
                  {money(Number(f.saldo))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold">
            <tr className="border-t-2 border-neutral-300">
              <td className="px-3 py-2 text-neutral-900">Totales (cuentas de movimiento)</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totD)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totC)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={`mt-3 rounded-md px-4 py-2 text-sm ${cuadra ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
        {cuadra
          ? "✓ La balanza cuadra: total débitos = total créditos."
          : `Descuadre de ${money(totD - totC)}.`}
      </div>
    </div>
  );
}
