import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { cuadreGastos } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimo = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  return { desde, hasta };
}
function mover(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function etiqueta(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default async function CuadreGastosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : "2026-07";
  const { desde, hasta } = rango(mes);
  const filas = await cuadreGastos(desde, hasta);

  const descuadres = filas.filter((f) => Math.abs(f.diferencia) > 0.01);
  const hrefMayor = (cuentaId: string) =>
    `/reportes/mayor?cuenta=${cuentaId}&desde=${desde}&hasta=${hasta}`;

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Cuadre de Gastos</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Compara, por cuenta, lo que registraste en el módulo de Gastos (auxiliar) contra lo que tiene la contabilidad
        (Mayor). Si no calzan, hay plata que entró a la cuenta por fuera del módulo (ej. un asiento directo).
      </p>

      {/* Selector de mes */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/reportes/cuadre-gastos?mes=${mover(mes, -1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          ← {etiqueta(mover(mes, -1))}
        </Link>
        <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium capitalize text-white">{etiqueta(mes)}</span>
        <Link
          href={`/reportes/cuadre-gastos?mes=${mover(mes, 1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          {etiqueta(mover(mes, 1))} →
        </Link>
      </div>

      {/* Resumen */}
      {descuadres.length === 0 ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          ✓ Todo cuadra — las {filas.length} cuentas de gasto coinciden con la contabilidad.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          ⚠️ {descuadres.length} cuenta{descuadres.length === 1 ? "" : "s"} con diferencia. Tocá la cuenta para ver en el
          Mayor qué entró por fuera del módulo de Gastos.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-right font-medium">Auxiliar (Gastos)</th>
              <th className="px-4 py-3 text-right font-medium">Mayor (contabilidad)</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  No hay cuentas de gasto con movimiento en el mes.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const descuadra = Math.abs(f.diferencia) > 0.01;
              return (
                <tr key={f.cuenta_id} className={descuadra ? "bg-amber-50/50" : undefined}>
                  <td className="px-4 py-2 text-neutral-700">
                    {descuadra ? (
                      <Link href={hrefMayor(f.cuenta_id)} className="underline decoration-dotted underline-offset-2 hover:text-neutral-900">
                        {f.cuenta_codigo} · {f.cuenta_nombre}
                      </Link>
                    ) : (
                      <span>
                        {f.cuenta_codigo} · {f.cuenta_nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money(f.auxiliar)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money(f.mayor)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${
                      descuadra ? "text-amber-700" : "text-neutral-400"
                    }`}
                  >
                    {descuadra ? money(f.diferencia) : "✓"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        El <b>auxiliar</b> es la suma de los gastos registrados en el módulo (a la cuenta, sin IVA). El <b>Mayor</b> es el
        movimiento neto de esa cuenta en la contabilidad. El prorrateo no afecta el cuadre (redistribuye entre centros,
        netea a cero por cuenta). Una diferencia positiva = movimientos en la cuenta que no pasaron por el módulo de Gastos.
      </p>
    </div>
  );
}
