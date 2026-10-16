import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { estadoResultados } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";
import ExportarExcel, { type FilaExcel, type ColExcel } from "@/components/ExportarExcel";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { desde: `${y}-${String(m).padStart(2, "0")}-01`, hasta: `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}` };
}
function etiquetaMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(2)}`;
}
function listaMeses(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const [ya, ma] = desde.split("-").map(Number);
  const [yb, mb] = hasta.split("-").map(Number);
  let cur = new Date(ya, ma - 1, 1);
  const fin = new Date(yb, mb - 1, 1);
  while (cur <= fin && out.length < 12) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out.length ? out : [desde];
}

interface Fila {
  centro_codigo: string;
  centro_nombre: string;
  seccion: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  monto: number;
}
type Row = { cod: string; nombre: string; celdas: Record<string, number> };

const SECCIONES: { seccion: string; titulo: string; neg?: boolean }[] = [
  { seccion: "ingresos_operacion", titulo: "Ingresos de operación" },
  { seccion: "costo_ventas", titulo: "Costo de ventas", neg: true },
  { seccion: "gastos_operacion", titulo: "Gastos de operación", neg: true },
  { seccion: "otros_ingresos", titulo: "Otros ingresos" },
  { seccion: "otros_gastos", titulo: "Otros gastos", neg: true },
];

export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; desde?: string; hasta?: string; prorrateo?: string; centro?: string | string[]; mesDesde?: string; mesHasta?: string; sumar?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");
  const sp = await searchParams;
  const modo = sp.modo === "meses" ? "meses" : "centro";
  const conProrrateo = sp.prorrateo !== "no";

  // Parámetros por modo
  const desde = sp.desde || "2026-07-01";
  const hasta = sp.hasta || "2026-07-31";
  const mesDesde = /^\d{4}-\d{2}$/.test(sp.mesDesde ?? "") ? (sp.mesDesde as string) : "2026-07";
  const mesHasta = /^\d{4}-\d{2}$/.test(sp.mesHasta ?? "") ? (sp.mesHasta as string) : "2026-08";
  // Centros seleccionados (checkboxes, varios). Vacío = todos (consolidado).
  const centrosSel = (Array.isArray(sp.centro) ? sp.centro : sp.centro ? [sp.centro] : []).filter((x) => x && x !== "TODOS");
  const meses = modo === "meses" ? listaMeses(mesDesde, mesHasta) : [];
  const sumar = sp.sumar === "si"; // comparar meses: sumar los centros marcados en vez de separarlos

  const cuentas = await listarCuentasPosteables();
  const codToId = new Map(cuentas.map((c: { id: string; codigo: string }) => [c.codigo, c.id]));

  // Carga de datos
  let datosPorMes: Fila[][] = [];
  let filas: Fila[] = [];
  if (modo === "meses") {
    datosPorMes = (await Promise.all(meses.map((m) => estadoResultados(rango(m).desde, rango(m).hasta, conProrrateo)))) as Fila[][];
  } else {
    filas = (await estadoResultados(desde, hasta, conProrrateo)) as Fila[];
  }

  // Centros disponibles (para el selector del modo meses y columnas del modo centro)
  const centrosMap = new Map<string, string>();
  for (const f of modo === "meses" ? datosPorMes.flat() : filas) centrosMap.set(f.centro_codigo, f.centro_nombre);
  const centrosOrden = [...centrosMap.keys()].sort();
  const centrosMostrar = centrosSel.length ? centrosOrden.filter((c) => centrosSel.includes(c)) : centrosOrden;
  const centrosLabel = centrosSel.length ? centrosSel.join(", ") : "todos (consolidado)";

  // Columnas (keys) según modo. En "comparar meses" separado: una columna por
  // centro × mes (key "CENTRO|mes") + "CENTRO|VAR"; sumado: columnas = meses.
  let cols: string[];
  if (modo !== "meses") {
    cols = [...centrosMostrar, "TOTAL"];
  } else if (sumar) {
    cols = [...meses, ...(meses.length > 1 ? ["VAR"] : [])];
  } else {
    cols = [];
    for (const ce of centrosMostrar) {
      for (const m of meses) cols.push(`${ce}|${m}`);
      if (meses.length > 1) cols.push(`${ce}|VAR`);
    }
  }
  const esVar = (k: string) => k === "VAR" || k.endsWith("|VAR");
  const colLabel = (k: string) => {
    if (k === "TOTAL") return "TOTAL";
    if (k === "VAR") return "Variación";
    if (k.includes("|")) { const [ce, mm] = k.split("|"); return mm === "VAR" ? `${ce} · Var` : `${ce} · ${etiquetaMes(mm)}`; }
    return modo === "meses" ? etiquetaMes(k) : k;
  };

  // Construcción de filas por sección (celdas keyed por col)
  const buildSeccion = (seccion: string): Row[] => {
    const porCuenta = new Map<string, Row>();
    const upd = (cod: string, nombre: string, colKey: string, monto: number) => {
      const e = porCuenta.get(cod) ?? { cod, nombre, celdas: {} };
      e.celdas[colKey] = (e.celdas[colKey] ?? 0) + monto;
      porCuenta.set(cod, e);
    };
    if (modo === "meses") {
      meses.forEach((m, i) => {
        for (const f of datosPorMes[i]) {
          if (f.seccion !== seccion) continue;
          if (sumar) {
            if (centrosSel.length && !centrosSel.includes(f.centro_codigo)) continue;
            upd(f.cuenta_codigo, f.cuenta_nombre, m, Number(f.monto));
          } else {
            if (!centrosMostrar.includes(f.centro_codigo)) continue;
            upd(f.cuenta_codigo, f.cuenta_nombre, `${f.centro_codigo}|${m}`, Number(f.monto));
          }
        }
      });
      if (meses.length > 1) {
        const lastM = meses[meses.length - 1], firstM = meses[0];
        for (const e of porCuenta.values()) {
          if (sumar) e.celdas.VAR = (e.celdas[lastM] ?? 0) - (e.celdas[firstM] ?? 0);
          else for (const ce of centrosMostrar) e.celdas[`${ce}|VAR`] = (e.celdas[`${ce}|${lastM}`] ?? 0) - (e.celdas[`${ce}|${firstM}`] ?? 0);
        }
      }
    } else {
      for (const f of filas) {
        if (f.seccion !== seccion) continue;
        if (centrosSel.length && !centrosSel.includes(f.centro_codigo)) continue;
        upd(f.cuenta_codigo, f.cuenta_nombre, f.centro_codigo, Number(f.monto));
      }
      for (const e of porCuenta.values()) e.celdas.TOTAL = centrosMostrar.reduce((s, c) => s + (e.celdas[c] ?? 0), 0);
    }
    return [...porCuenta.values()].sort((a, b) => a.cod.localeCompare(b.cod));
  };
  const totalDe = (rows: Row[]): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const r of rows) for (const c of cols) t[c] = (t[c] ?? 0) + (r.celdas[c] ?? 0);
    return t;
  };

  const secRows = SECCIONES.map((s) => ({ ...s, rows: buildSeccion(s.seccion), total: {} as Record<string, number> }));
  secRows.forEach((s) => (s.total = totalDe(s.rows)));
  const byKey = Object.fromEntries(secRows.map((s) => [s.seccion, s]));

  const combinar = (fn: (c: string) => number) => Object.fromEntries(cols.map((c) => [c, fn(c)])) as Record<string, number>;
  const t = (k: string, c: string) => byKey[k].total[c] ?? 0;
  const utilBruta = combinar((c) => t("ingresos_operacion", c) - t("costo_ventas", c));
  const utilOper = combinar((c) => utilBruta[c] - t("gastos_operacion", c));
  const antesImp = combinar((c) => utilOper[c] + t("otros_ingresos", c) - t("otros_gastos", c));

  const hayDatos = (modo === "meses" ? datosPorMes.flat() : filas).length > 0;

  // Drill-down al detalle de la cuenta
  const hrefMayor = (cod: string, colKey: string) => {
    const id = codToId.get(cod);
    if (!id || esVar(colKey)) return null;
    const p = new URLSearchParams({ cuenta: id });
    if (modo === "meses") {
      if (colKey.includes("|")) {
        const [ce, mm] = colKey.split("|");
        const rg = rango(mm);
        p.set("desde", rg.desde); p.set("hasta", rg.hasta); p.set("centro", ce);
      } else {
        const rg = rango(colKey);
        p.set("desde", rg.desde); p.set("hasta", rg.hasta);
        if (centrosSel.length === 1) p.set("centro", centrosSel[0]);
      }
    } else {
      p.set("desde", desde); p.set("hasta", hasta);
      if (colKey !== "TOTAL") p.set("centro", colKey);
    }
    if (!conProrrateo) p.set("prorrateo", "no");
    return `/reportes/detalle-cuenta?${p.toString()}`;
  };

  // Excel
  const excelCols: ColExcel[] = [{ titulo: "Cuenta", ancho: 42 }, ...cols.map((c) => ({ titulo: colLabel(c), money: true, ancho: 15 }))];
  const secExcel = (titulo: string, rows: Row[], total: Record<string, number>): FilaExcel[] => {
    if (rows.length === 0) return [];
    const out: FilaExcel[] = [{ celdas: [titulo], estilo: "seccion" }];
    for (const r of rows) out.push({ celdas: [`${r.cod} · ${r.nombre}`, ...cols.map((c) => r.celdas[c] ?? 0)], estilo: "dato" });
    out.push({ celdas: [`Total ${titulo.toLowerCase()}`, ...cols.map((c) => total[c] ?? 0)], estilo: "subtotal" });
    return out;
  };
  const excel: FilaExcel[] = [
    ...secExcel("Ingresos de operación", byKey.ingresos_operacion.rows, byKey.ingresos_operacion.total),
    ...secExcel("Costo de ventas", byKey.costo_ventas.rows, byKey.costo_ventas.total),
    { celdas: ["Utilidad bruta", ...cols.map((c) => utilBruta[c] ?? 0)], estilo: "total" },
    ...secExcel("Gastos de operación", byKey.gastos_operacion.rows, byKey.gastos_operacion.total),
    { celdas: ["Utilidad de operación", ...cols.map((c) => utilOper[c] ?? 0)], estilo: "total" },
    ...secExcel("Otros ingresos", byKey.otros_ingresos.rows, byKey.otros_ingresos.total),
    ...secExcel("Otros gastos", byKey.otros_gastos.rows, byKey.otros_gastos.total),
    { celdas: ["Utilidad antes de impuestos", ...cols.map((c) => antesImp[c] ?? 0)], estilo: "total" },
  ];

  const SeccionRows = ({ titulo, rows, total, neg }: { titulo: string; rows: Row[]; total: Record<string, number>; neg?: boolean }) =>
    rows.length === 0 ? null : (
      <>
        <tr className="bg-neutral-50/60">
          <td className="px-3 py-1.5 font-semibold text-neutral-800" colSpan={cols.length + 1}>{titulo}</td>
        </tr>
        {rows.map((r) => (
          <tr key={r.cod} className="border-t border-neutral-100">
            <td className="px-3 py-1.5 text-neutral-700"><span className="text-neutral-400">{r.cod}</span> {r.nombre}</td>
            {cols.map((c) => {
              const v = r.celdas[c] ?? 0;
              const colVar = esVar(c);
              const txt = v ? (neg && !colVar && v > 0 ? `(${money(v)})` : money(v)) : "";
              const href = v && !colVar ? hrefMayor(r.cod, c) : null;
              return (
                <td key={c} className={`px-3 py-1.5 text-right tabular-nums ${colVar ? (v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "") : ""}`}>
                  {href ? (
                    <Link href={href} className="text-neutral-600 underline decoration-dotted underline-offset-2 hover:text-neutral-900" title="Ver el detalle de esta cuenta">{txt}</Link>
                  ) : (
                    <span className={colVar ? "" : "text-neutral-600"}>{colVar && v ? (v > 0 ? `+${money(v)}` : `(${money(-v)})`) : txt}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        <tr className="border-t border-neutral-200 text-sm font-medium text-neutral-700">
          <td className="px-3 py-1.5">Total {titulo.toLowerCase()}</td>
          {cols.map((c) => (
            <td key={c} className="px-3 py-1.5 text-right tabular-nums">{neg && !esVar(c) ? `(${money(total[c] ?? 0)})` : money(total[c] ?? 0)}</td>
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

  const qsModo = (m: "centro" | "meses") => {
    const p = new URLSearchParams();
    p.set("modo", m);
    if (!conProrrateo) p.set("prorrateo", "no");
    if (m === "meses") { p.set("mesDesde", mesDesde); p.set("mesHasta", mesHasta); if (sumar) p.set("sumar", "si"); }
    else { p.set("desde", desde); p.set("hasta", hasta); }
    for (const cc of centrosSel) p.append("centro", cc);
    return `/reportes/resultados?${p.toString()}`;
  };

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">← Reportes</Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Estado de Resultados</h1>
      <p className="mb-4 text-sm text-neutral-500">Por centro de costo, o comparando mes a mes, con utilidad bruta, de operación y antes de impuestos.</p>

      {/* Toggle de vista */}
      <div className="mb-3 inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm">
        <Link href={qsModo("centro")} className={`px-3 py-1.5 ${modo === "centro" ? "bg-neutral-900 font-medium text-white" : "text-neutral-700 hover:bg-neutral-50"}`}>Por centro de costo</Link>
        <Link href={qsModo("meses")} className={`border-l border-neutral-300 px-3 py-1.5 ${modo === "meses" ? "bg-neutral-900 font-medium text-white" : "text-neutral-700 hover:bg-neutral-50"}`}>Comparar meses</Link>
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="modo" value={modo} />
        {modo === "centro" ? (
          <>
            <div><label className="block text-xs text-neutral-500">Desde</label><input type="date" name="desde" defaultValue={desde} className="rounded-md border border-neutral-300 px-2 py-1.5" /></div>
            <div><label className="block text-xs text-neutral-500">Hasta</label><input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-neutral-300 px-2 py-1.5" /></div>
          </>
        ) : (
          <>
            <div><label className="block text-xs text-neutral-500">Mes desde</label><input type="month" name="mesDesde" defaultValue={mesDesde} className="rounded-md border border-neutral-300 px-2 py-1.5" /></div>
            <div><label className="block text-xs text-neutral-500">Mes hasta</label><input type="month" name="mesHasta" defaultValue={mesHasta} className="rounded-md border border-neutral-300 px-2 py-1.5" /></div>
          </>
        )}
        {/* Centros de costo (varios). Sin marcar ninguno = todos (consolidado). */}
        <div>
          <label className="block text-xs text-neutral-500">
            Centros de costo {modo === "meses" ? "(consolida los marcados)" : "(columnas)"} · sin marcar = todos
          </label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-neutral-300 px-2 py-2">
            {centrosOrden.map((c) => (
              <label key={c} className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-700" title={centrosMap.get(c)}>
                <input type="checkbox" name="centro" value={c} defaultChecked={centrosSel.includes(c)} className="h-3.5 w-3.5 accent-neutral-900" />
                {c} <span className="text-neutral-400">{centrosMap.get(c)}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="prorrateo" value="no" defaultChecked={!conProrrateo} className="h-4 w-4" />
          <span className="text-neutral-600">Sin prorrateo (ver qué costó el Taller)</span>
        </label>
        {modo === "meses" && (
          <label className="flex items-center gap-2 pb-1.5">
            <input type="checkbox" name="sumar" value="si" defaultChecked={sumar} className="h-4 w-4" />
            <span className="text-neutral-600">Sumar los centros (consolidar)</span>
          </label>
        )}
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">Aplicar</button>
        <ExportarExcel
          nombre={`estado-resultados-${modo === "meses" ? `${mesDesde}_${mesHasta}` : `${desde}_${hasta}`}${centrosSel.length ? "_" + centrosSel.join("-") : ""}.xlsx`}
          hoja="Resultados"
          titulo="Estado de Resultados"
          subtitulo={`Panaderías Chepito · ${modo === "meses" ? `comparar ${etiquetaMes(mesDesde)}–${etiquetaMes(mesHasta)}` : `${desde} a ${hasta}`} · ${centrosLabel}${conProrrateo ? " · con prorrateo" : " · sin prorrateo"}`}
          columnas={excelCols}
          filas={excel}
        />
      </form>

      {!hayDatos ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">No hay movimientos confirmados en el rango elegido.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                {cols.map((c) => <th key={c} className="px-3 py-2 text-right font-medium">{colLabel(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              <SeccionRows titulo="Ingresos de operación" rows={byKey.ingresos_operacion.rows} total={byKey.ingresos_operacion.total} />
              <SeccionRows titulo="Costo de ventas" rows={byKey.costo_ventas.rows} total={byKey.costo_ventas.total} neg />
              <Subtotal titulo="Utilidad bruta" valores={utilBruta} />
              <SeccionRows titulo="Gastos de operación" rows={byKey.gastos_operacion.rows} total={byKey.gastos_operacion.total} neg />
              <Subtotal titulo="Utilidad de operación" valores={utilOper} />
              <SeccionRows titulo="Otros ingresos" rows={byKey.otros_ingresos.rows} total={byKey.otros_ingresos.total} />
              <SeccionRows titulo="Otros gastos" rows={byKey.otros_gastos.rows} total={byKey.otros_gastos.total} neg />
              <Subtotal titulo="Utilidad antes de impuestos" valores={antesImp} fuerte />
            </tbody>
          </table>
        </div>
      )}

      {hayDatos && (
        <p className="mt-3 text-xs text-neutral-500">
          {modo === "meses"
            ? (sumar
                ? <>Consolidando <b>{centrosLabel}</b> mes a mes (sumados). La columna <b>Variación</b> = último mes − primero.</>
                : <>Cada centro (<b>{centrosLabel}</b>) es su <b>propia columna</b> por mes — no se suman. <b>Variación</b> = último mes − primero de cada centro.</>)
            : <>Columnas = centros de costo (<b>{centrosLabel}</b>). {conProrrateo ? "El Taller aparece repartido a los canales (prorrateo)." : "El Taller aparece como columna sin repartir."}</>}{" "}
          Costos y gastos en positivo; los subtotales ya los restan. Tocá una celda para ver el detalle.
        </p>
      )}
    </div>
  );
}
