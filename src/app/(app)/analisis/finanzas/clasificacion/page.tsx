import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { cuentasClasificables, type CuentaClasificable } from "@/lib/data/finanzas";
import { ultimoMesConVentas, mesActual, rangoYTD } from "@/lib/data/analisis";
import { fijarClasificacion } from "@/app/(app)/analisis/finanzas/actions";

const SECCION_LBL: Record<string, string> = {
  costo_ventas: "Costo de ventas",
  gastos_operacion: "Gastos de operación",
  otros_gastos: "Otros gastos",
};

const money0 = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR");

export default async function ClasificacionPage() {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/");

  const mes = (await ultimoMesConVentas()) ?? mesActual();
  const { desde, hasta } = rangoYTD(mes);
  const cuentas = await cuentasClasificables(desde, hasta);

  // Agrupar por sección respetando un orden fijo.
  const orden = ["costo_ventas", "gastos_operacion", "otros_gastos"];
  const grupos = orden
    .map((sec) => ({ sec, filas: cuentas.filter((c) => c.seccion === sec) }))
    .filter((g) => g.filas.length > 0);

  return (
    <div>
      <div className="mb-4">
        <Link href="/analisis/finanzas" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Rentabilidad
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Costos fijos vs variables</h1>
        <p className="text-sm text-neutral-500">
          Define qué cuentas suben con las ventas (<b>variables</b>) y cuáles no (<b>fijas</b>). Esto alimenta el punto de
          equilibrio. Por defecto: costo de ventas = variable, gastos = fijos. Cambiá solo lo que haga falta; “Auto” vuelve
          al valor por defecto. Cuentas con movimiento este año ({mes.slice(0, 4)}).
        </p>
      </div>

      <div className="space-y-6">
        {grupos.map((g) => (
          <div key={g.sec} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
              {SECCION_LBL[g.sec] ?? g.sec}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Cuenta</th>
                  <th className="px-4 py-2 text-right font-medium">Monto año</th>
                  <th className="px-4 py-2 text-center font-medium">Clasificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {g.filas.map((c) => (
                  <FilaCuenta key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {grupos.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
            No hay cuentas de costo con movimiento este año.
          </p>
        )}
      </div>
    </div>
  );
}

function FilaCuenta({ c }: { c: CuentaClasificable }) {
  return (
    <tr className="text-neutral-700">
      <td className="px-4 py-2">
        <div className="text-neutral-800">{c.nombre}</div>
        <div className="font-mono text-xs text-neutral-400">{c.codigo}</div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money0(Math.abs(c.monto))}</td>
      <td className="px-4 py-2">
        <form action={fijarClasificacion} className="flex items-center justify-center gap-1">
          <input type="hidden" name="cuenta_id" value={c.id} />
          <Boton tipo="variable" activo={c.tipo === "variable"} />
          <Boton tipo="fijo" activo={c.tipo === "fijo"} />
          <button
            type="submit"
            name="tipo"
            value="default"
            className={`rounded-md border px-2 py-1 text-xs ${
              !c.esOverride
                ? "border-neutral-300 bg-neutral-100 font-medium text-neutral-700"
                : "border-neutral-200 text-neutral-400 hover:bg-neutral-50"
            }`}
            title={`Auto: por defecto es ${c.defaultTipo}`}
          >
            Auto
          </button>
        </form>
      </td>
    </tr>
  );
}

function Boton({ tipo, activo }: { tipo: "variable" | "fijo"; activo: boolean }) {
  const label = tipo === "variable" ? "Variable" : "Fijo";
  const activoCls =
    tipo === "variable"
      ? "border-amber-300 bg-amber-50 font-medium text-amber-800"
      : "border-sky-300 bg-sky-50 font-medium text-sky-800";
  return (
    <button
      type="submit"
      name="tipo"
      value={tipo}
      className={`rounded-md border px-2 py-1 text-xs ${activo ? activoCls : "border-neutral-200 text-neutral-400 hover:bg-neutral-50"}`}
    >
      {label}
    </button>
  );
}
