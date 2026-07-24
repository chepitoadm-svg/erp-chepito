import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { estadoResultados } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; prorrateo?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const desde = sp.desde || "2026-07-01";
  const hasta = sp.hasta || "2026-07-31";
  const conProrrateo = sp.prorrateo !== "no";

  const filas = await estadoResultados(desde, hasta, conProrrateo);

  // Centros presentes (columnas), ordenados. Solo finales si hay prorrateo;
  // con "sin prorrateo" también aparece el Taller cargando su gasto.
  const centros = Array.from(new Set(filas.map((f) => f.centro_codigo))).sort();

  // Pivote: cuenta (fila) x centro (columna), separado por sección.
  type Celda = Record<string, number>;
  const armar = (seccion: string) => {
    const porCuenta = new Map<string, { nombre: string; cod: string; celdas: Celda }>();
    for (const f of filas.filter((x) => x.seccion === seccion)) {
      const k = f.cuenta_codigo;
      if (!porCuenta.has(k))
        porCuenta.set(k, { nombre: f.cuenta_nombre, cod: k, celdas: {} });
      porCuenta.get(k)!.celdas[f.centro_codigo] =
        (porCuenta.get(k)!.celdas[f.centro_codigo] ?? 0) + Number(f.monto);
    }
    return Array.from(porCuenta.values()).sort((a, b) => a.cod.localeCompare(b.cod));
  };

  const ingresos = armar("INGRESOS");
  const gastos = armar("GASTOS");

  const totalPorCentro = (rows: ReturnType<typeof armar>) => {
    const t: Celda = {};
    for (const r of rows) for (const c of centros) t[c] = (t[c] ?? 0) + (r.celdas[c] ?? 0);
    return t;
  };
  const totIng = totalPorCentro(ingresos);
  const totGas = totalPorCentro(gastos);
  const utilidad: Celda = {};
  for (const c of centros) utilidad[c] = (totIng[c] ?? 0) - (totGas[c] ?? 0);
  const utilidadTotal = centros.reduce((s, c) => s + utilidad[c], 0);

  const Fila = ({
    cod,
    nombre,
    celdas,
    negativo,
  }: {
    cod: string;
    nombre: string;
    celdas: Celda;
    negativo?: boolean;
  }) => (
    <tr className="border-t border-neutral-100">
      <td className="px-3 py-1.5 text-neutral-700">
        <span className="text-neutral-400">{cod}</span> {nombre}
      </td>
      {centros.map((c) => (
        <td key={c} className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
          {celdas[c] ? (negativo ? `(${money(celdas[c])})` : money(celdas[c])) : ""}
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Estado de Resultados</h1>
      <p className="mb-4 text-sm text-neutral-500">Por centro de costo (canal).</p>

      {/* Filtros */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="prorrateo" value="no" defaultChecked={!conProrrateo} className="h-4 w-4" />
          <span className="text-neutral-600">Sin prorrateo (ver qué costó el Taller)</span>
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Aplicar
        </button>
      </form>

      {filas.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          No hay movimientos confirmados en el rango elegido.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                {centros.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-neutral-50/60">
                <td className="px-3 py-1.5 font-semibold text-neutral-800" colSpan={centros.length + 1}>
                  INGRESOS
                </td>
              </tr>
              {ingresos.map((r) => <Fila key={r.cod} {...r} celdas={r.celdas} />)}
              <tr className="border-t border-neutral-200 font-medium">
                <td className="px-3 py-1.5 text-neutral-700">Total ingresos</td>
                {centros.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-right tabular-nums">{money(totIng[c] ?? 0)}</td>
                ))}
              </tr>

              <tr className="bg-neutral-50/60">
                <td className="px-3 py-1.5 font-semibold text-neutral-800" colSpan={centros.length + 1}>
                  GASTOS
                </td>
              </tr>
              {gastos.map((r) => <Fila key={r.cod} {...r} celdas={r.celdas} negativo />)}
              <tr className="border-t border-neutral-200 font-medium">
                <td className="px-3 py-1.5 text-neutral-700">Total gastos</td>
                {centros.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-right tabular-nums">({money(totGas[c] ?? 0)})</td>
                ))}
              </tr>

              <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
                <td className="px-3 py-2 text-neutral-900">Utilidad / (pérdida)</td>
                {centros.map((c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 text-right tabular-nums ${utilidad[c] < 0 ? "text-red-600" : "text-neutral-900"}`}
                  >
                    {utilidad[c] < 0 ? `(${money(-utilidad[c])})` : money(utilidad[c])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && (
        <p className="mt-3 text-sm text-neutral-500">
          Utilidad total del periodo:{" "}
          <span className="font-medium text-neutral-900">{money(utilidadTotal)}</span>
          {conProrrateo
            ? " · con el gasto del Taller repartido a los canales."
            : " · el Taller aparece como columna con su gasto sin repartir."}
        </p>
      )}
    </div>
  );
}
