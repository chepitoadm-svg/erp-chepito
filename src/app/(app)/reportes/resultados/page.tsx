import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { estadoResultados } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Fila {
  centro_codigo: string;
  seccion: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  monto: number;
}

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

  const [filas, cuentas] = await Promise.all([
    estadoResultados(desde, hasta, conProrrateo) as Promise<Fila[]>,
    listarCuentasPosteables(),
  ]);
  // código de cuenta -> id, para enlazar cada celda al Libro Mayor (drill-down).
  const codToId = new Map(cuentas.map((c: { id: string; codigo: string }) => [c.codigo, c.id]));
  const hrefMayor = (cod: string, centro: string) => {
    const id = codToId.get(cod);
    if (!id) return null;
    const p = new URLSearchParams({ cuenta: id, desde, hasta });
    if (centro !== "TOTAL") p.set("centro", centro);
    if (!conProrrateo) p.set("prorrateo", "no");
    return `/reportes/mayor?${p.toString()}`;
  };

  const centros = Array.from(new Set(filas.map((f) => f.centro_codigo))).sort();
  const cols = [...centros, "TOTAL"];
  const conTotal = (celdas: Record<string, number>) => {
    celdas.TOTAL = centros.reduce((s, c) => s + (celdas[c] ?? 0), 0);
    return celdas;
  };

  // Filas de una sección: cuenta x centro (+ TOTAL).
  const armar = (seccion: string) => {
    const porCuenta = new Map<string, { cod: string; nombre: string; celdas: Record<string, number> }>();
    for (const f of filas.filter((x) => x.seccion === seccion)) {
      const e = porCuenta.get(f.cuenta_codigo) ?? { cod: f.cuenta_codigo, nombre: f.cuenta_nombre, celdas: {} };
      e.celdas[f.centro_codigo] = (e.celdas[f.centro_codigo] ?? 0) + Number(f.monto);
      porCuenta.set(f.cuenta_codigo, e);
    }
    const rows = [...porCuenta.values()].sort((a, b) => a.cod.localeCompare(b.cod));
    rows.forEach((r) => conTotal(r.celdas));
    return rows;
  };
  const totalDe = (rows: ReturnType<typeof armar>) => {
    const t: Record<string, number> = {};
    for (const r of rows) for (const c of cols) t[c] = (t[c] ?? 0) + (r.celdas[c] ?? 0);
    return t;
  };

  const ingOper = armar("ingresos_operacion");
  const costo = armar("costo_ventas");
  const gastosOper = armar("gastos_operacion");
  const otrosIng = armar("otros_ingresos");
  const otrosGas = armar("otros_gastos");

  const tIngOper = totalDe(ingOper);
  const tCosto = totalDe(costo);
  const tGastosOper = totalDe(gastosOper);
  const tOtrosIng = totalDe(otrosIng);
  const tOtrosGas = totalDe(otrosGas);

  const combinar = (fn: (c: string) => number) => {
    const r: Record<string, number> = {};
    for (const c of cols) r[c] = fn(c);
    return r;
  };
  const utilBruta = combinar((c) => (tIngOper[c] ?? 0) - (tCosto[c] ?? 0));
  const utilOper = combinar((c) => utilBruta[c] - (tGastosOper[c] ?? 0));
  const antesImp = combinar((c) => utilOper[c] + (tOtrosIng[c] ?? 0) - (tOtrosGas[c] ?? 0));

  const SeccionRows = ({ titulo, rows, total, neg }: { titulo: string; rows: ReturnType<typeof armar>; total: Record<string, number>; neg?: boolean }) =>
    rows.length === 0 ? null : (
      <>
        <tr className="bg-neutral-50/60">
          <td className="px-3 py-1.5 font-semibold text-neutral-800" colSpan={cols.length + 1}>
            {titulo}
          </td>
        </tr>
        {rows.map((r) => (
          <tr key={r.cod} className="border-t border-neutral-100">
            <td className="px-3 py-1.5 text-neutral-700">
              <span className="text-neutral-400">{r.cod}</span> {r.nombre}
            </td>
            {cols.map((c) => {
              const v = r.celdas[c] ?? 0;
              const txt = v ? (neg && v > 0 ? `(${money(v)})` : money(v)) : "";
              const href = v ? hrefMayor(r.cod, c) : null;
              return (
                <td key={c} className="px-3 py-1.5 text-right tabular-nums">
                  {href ? (
                    <Link
                      href={href}
                      className="text-neutral-600 underline decoration-dotted underline-offset-2 hover:text-neutral-900"
                      title="Ver el detalle en el Libro Mayor"
                    >
                      {txt}
                    </Link>
                  ) : (
                    <span className="text-neutral-600">{txt}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        <tr className="border-t border-neutral-200 text-sm font-medium text-neutral-700">
          <td className="px-3 py-1.5">Total {titulo.toLowerCase()}</td>
          {cols.map((c) => (
            <td key={c} className="px-3 py-1.5 text-right tabular-nums">
              {neg ? `(${money(total[c] ?? 0)})` : money(total[c] ?? 0)}
            </td>
          ))}
        </tr>
      </>
    );

  const Subtotal = ({ titulo, valores, fuerte }: { titulo: string; valores: Record<string, number>; fuerte?: boolean }) => (
    <tr className={`border-t-2 ${fuerte ? "border-neutral-400 bg-neutral-100" : "border-neutral-300 bg-neutral-50"} font-semibold`}>
      <td className="px-3 py-2 text-neutral-900">{titulo}</td>
      {cols.map((c) => (
        <td key={c} className={`px-3 py-2 text-right tabular-nums ${valores[c] < 0 ? "text-red-600" : "text-neutral-900"}`}>
          {valores[c] < 0 ? `(${money(-valores[c])})` : money(valores[c] ?? 0)}
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
      <p className="mb-4 text-sm text-neutral-500">Por centro de costo (canal), con utilidad bruta, de operación y antes de impuestos.</p>

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
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SeccionRows titulo="Ingresos de operación" rows={ingOper} total={tIngOper} />
              <SeccionRows titulo="Costo de ventas" rows={costo} total={tCosto} neg />
              <Subtotal titulo="Utilidad bruta" valores={utilBruta} />
              <SeccionRows titulo="Gastos de operación" rows={gastosOper} total={tGastosOper} neg />
              <Subtotal titulo="Utilidad de operación" valores={utilOper} />
              <SeccionRows titulo="Otros ingresos" rows={otrosIng} total={tOtrosIng} />
              <SeccionRows titulo="Otros gastos" rows={otrosGas} total={tOtrosGas} neg />
              <Subtotal titulo="Utilidad antes de impuestos" valores={antesImp} fuerte />
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          {conProrrateo
            ? "El gasto del Taller aparece repartido a los canales (prorrateo)."
            : "El Taller aparece como columna con su gasto sin repartir."}{" "}
          Los costos y gastos se muestran en positivo; los subtotales ya los restan.
        </p>
      )}
    </div>
  );
}
