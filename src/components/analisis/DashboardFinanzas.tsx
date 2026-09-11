"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface CVP {
  ventas: number;
  costoVentas: number;
  gastos: number;
  otrosIng: number;
  otrosGas: number;
  variables: number;
  fijos: number;
  margenContribucion: number;
  mcPct: number;
  costosFijosEfectivos: number;
  margenBruto: number;
  margenBrutoPct: number;
  utilidadOper: number;
  utilidad: number;
  margenNetoPct: number;
  puntoEquilibrio: number | null;
  margenSeguridadPct: number | null;
  gao: number | null;
}

interface FinData {
  etiquetaSel: string;
  etiquetaAnt: string;
  metaPct: number;
  diasVenta: number;
  sel: CVP;
  ant: CVP;
  ytd: CVP;
  centros: string[];
  porCentroSel: { centro: string; cvp: CVP; dias: number }[];
  serie: { etiqueta: string; ventas: number; puntoEquilibrio: number | null; utilidad: number; mcPct: number }[];
}

const COLOR = { ventas: "#171717", pe: "#be123c", utilidad: "#4f46e5" };

const money0 = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR");
const money2 = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => (x * 100).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return "₡" + (n / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return "₡" + Math.round(n / 1_000) + "k";
  return "₡" + Math.round(n);
};

const ttStyle = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" },
  labelStyle: { color: "#525252" },
};

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: React.ReactNode; tono?: "verde" | "rojo" }) {
  const color = tono === "verde" ? "text-green-700" : tono === "rojo" ? "text-red-700" : "text-neutral-900";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

// Cuánto vender por mes para lograr una utilidad = metaPct % sobre ventas:
//   ventas·MC% − CF = ventas·metaPct  →  ventas = CF / (MC% − metaPct)
function ventaMeta(cf: number, mcPct: number, metaPct: number): number | null {
  const d = mcPct - metaPct;
  return d > 0 ? cf / d : null;
}

export default function DashboardFinanzas({ data }: { data: FinData }) {
  const s = data.sel;
  const dias = data.diasVenta || 0;
  const pe = s.puntoEquilibrio;
  const ventaDiaActual = dias > 0 ? s.ventas / dias : null;
  const metaDiaEquilibrio = pe != null && dias > 0 ? pe / dias : null;
  const ventasMetaUtil = ventaMeta(s.costosFijosEfectivos, s.mcPct, data.metaPct);
  const metaDiaUtil = ventasMetaUtil != null && dias > 0 ? ventasMetaUtil / dias : null;
  const sobreEquilibrio = pe != null && s.ventas >= pe;
  const gapMes = pe != null ? s.ventas - pe : null; // + sobra, − falta

  return (
    <div className="space-y-4">
      {/* KPIs cabecera */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={`Punto de equilibrio · ${data.etiquetaSel}`}
          valor={pe == null ? "—" : money0(pe)}
          sub={pe == null ? "el costo variable se come la venta" : metaDiaEquilibrio != null ? `${money0(metaDiaEquilibrio)}/día para no perder` : "por mes para no perder"}
        />
        <Kpi
          label="Ventas del mes"
          valor={money0(s.ventas)}
          tono={pe == null ? undefined : sobreEquilibrio ? "verde" : "rojo"}
          sub={
            s.margenSeguridadPct == null
              ? `${dias} días con venta`
              : sobreEquilibrio
                ? `${pct(s.margenSeguridadPct)} sobre el equilibrio`
                : `${pct(Math.abs(s.margenSeguridadPct))} bajo el equilibrio`
          }
        />
        <Kpi
          label="Margen de contribución"
          valor={pct(s.mcPct)}
          sub={`de cada ₡100, ₡${Math.round(s.mcPct * 100)} pagan lo fijo`}
        />
        <Kpi
          label="Utilidad neta"
          valor={money0(s.utilidad)}
          tono={s.utilidad >= 0 ? "verde" : "rojo"}
          sub={`margen neto ${pct(s.margenNetoPct)}`}
        />
      </div>

      {/* Panel de metas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-800">Para NO perder (equilibrio)</h2>
          {pe == null ? (
            <p className="mt-2 text-sm text-neutral-500">
              Con esta estructura de costos, cada venta no deja contribución (el costo variable iguala o supera el precio).
              Revisá precios o el costo de la materia prima.
            </p>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-neutral-700">
              <Renglon k="Vender por mes" v={money0(pe)} />
              <Renglon k={`Vender por día (${dias} días)`} v={metaDiaEquilibrio != null ? money0(metaDiaEquilibrio) : "—"} fuerte />
              <Renglon
                k="Vendés hoy por día"
                v={ventaDiaActual != null ? money0(ventaDiaActual) : "—"}
                tono={ventaDiaActual != null && metaDiaEquilibrio != null ? (ventaDiaActual >= metaDiaEquilibrio ? "verde" : "rojo") : undefined}
              />
              <div className="mt-1 border-t border-neutral-100 pt-1">
                <Renglon
                  k="Te falta / sobra (mes)"
                  v={gapMes == null ? "—" : `${gapMes >= 0 ? "sobra " : "falta "}${money0(Math.abs(gapMes))}`}
                  fuerte
                  tono={gapMes == null ? undefined : gapMes >= 0 ? "verde" : "rojo"}
                />
              </div>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
          <h2 className="text-sm font-semibold text-neutral-800">
            Para ganar {pct(data.metaPct)} sobre ventas
          </h2>
          {ventasMetaUtil == null ? (
            <p className="mt-2 text-sm text-neutral-500">
              La meta de {pct(data.metaPct)} no se alcanza con el margen de contribución actual ({pct(s.mcPct)}). Bajá la
              meta o mejorá el margen.
            </p>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-neutral-700">
              <Renglon k="Vender por mes" v={money0(ventasMetaUtil)} />
              <Renglon k={`Vender por día (${dias} días)`} v={metaDiaUtil != null ? money0(metaDiaUtil) : "—"} fuerte />
              <Renglon k="Utilidad que dejaría" v={money0(ventasMetaUtil * data.metaPct)} tono="verde" />
            </div>
          )}
        </div>
      </div>

      {/* Tendencia ventas vs punto de equilibrio */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-800">Ventas vs punto de equilibrio (12 meses)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.serie} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#737373" }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#737373" }} width={52} />
            <Tooltip formatter={(v) => (v == null ? "—" : money2(Number(v)))} {...ttStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ventas" name="Ventas" fill={COLOR.ventas} radius={[3, 3, 0, 0]} maxBarSize={34} />
            <Line type="monotone" dataKey="puntoEquilibrio" name="Punto de equilibrio" stroke={COLOR.pe} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke={COLOR.utilidad} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-xs text-neutral-400">
          Mientras la barra (ventas) esté por encima de la línea roja (equilibrio), el mes da ganancia.
        </p>
      </div>

      {/* Desglose CVP del mes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
            Cómo se forma la utilidad · {data.etiquetaSel}
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              <Fila k="Ventas netas" v={s.ventas} />
              <Fila k="− Costos variables" v={-s.variables} sub={s.ventas ? pct(s.variables / s.ventas) : undefined} />
              <Fila k="= Margen de contribución" v={s.margenContribucion} sub={pct(s.mcPct)} fuerte />
              <Fila k="− Costos fijos" v={-s.fijos} />
              {s.otrosIng > 0 && <Fila k="+ Otros ingresos" v={s.otrosIng} />}
              <Fila k="= Utilidad (antes de imp.)" v={s.utilidad} sub={pct(s.margenNetoPct)} fuerte total />
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
            Indicadores del analista · {data.etiquetaSel}
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              <FilaTxt k="Punto de equilibrio (mes)" v={pe == null ? "—" : money0(pe)} ayuda="Ventas para utilidad cero." />
              <FilaTxt
                k="Margen de seguridad"
                v={s.margenSeguridadPct == null ? "—" : pct(s.margenSeguridadPct)}
                ayuda="Cuánto pueden caer las ventas antes de perder."
                tono={s.margenSeguridadPct == null ? undefined : s.margenSeguridadPct >= 0 ? "verde" : "rojo"}
              />
              <FilaTxt
                k="Apalancamiento operativo"
                v={s.gao == null ? "—" : s.gao.toLocaleString("es-CR", { maximumFractionDigits: 1 }) + "×"}
                ayuda="Si las ventas suben 1%, la utilidad sube esto ×."
              />
              <FilaTxt k="Margen bruto" v={pct(s.margenBrutoPct)} ayuda="Ventas menos costo de ventas." />
              <FilaTxt k="Costos fijos del mes" v={money0(s.fijos)} ayuda="No cambian con las ventas." />
              <FilaTxt k="Costos variables del mes" v={money0(s.variables)} ayuda="Suben y bajan con las ventas." />
            </tbody>
          </table>
        </div>
      </div>

      {/* Por sucursal */}
      {data.porCentroSel.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Sucursal</th>
                <th className="px-4 py-2 text-right font-medium">Vendés</th>
                <th className="px-4 py-2 text-right font-medium">Margen contrib.</th>
                <th className="px-4 py-2 text-right font-medium">Equilibrio/mes</th>
                <th className="px-4 py-2 text-right font-medium">Falta / sobra</th>
                <th className="px-4 py-2 text-right font-medium">Meta/día</th>
                <th className="px-4 py-2 text-right font-medium">Margen seg.</th>
                <th className="px-4 py-2 text-right font-medium">Utilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.porCentroSel.map(({ centro, cvp, dias }) => {
                const md = cvp.puntoEquilibrio != null && dias > 0 ? cvp.puntoEquilibrio / dias : null;
                const gap = cvp.puntoEquilibrio == null ? null : cvp.ventas - cvp.puntoEquilibrio; // + sobra, − falta
                return (
                  <tr key={centro} className="text-neutral-700">
                    <td className="px-4 py-2 font-medium text-neutral-900">{centro}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money0(cvp.ventas)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pct(cvp.mcPct)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{cvp.puntoEquilibrio == null ? "—" : money0(cvp.puntoEquilibrio)}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${gap == null ? "" : gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {gap == null ? "—" : `${gap >= 0 ? "sobra " : "falta "}${money0(Math.abs(gap))}`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{md == null ? "—" : money0(md)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${cvp.margenSeguridadPct == null ? "" : cvp.margenSeguridadPct >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {cvp.margenSeguridadPct == null ? "—" : pct(cvp.margenSeguridadPct)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${cvp.utilidad >= 0 ? "text-neutral-900" : "text-red-700"}`}>{money0(cvp.utilidad)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-400">
        Fijos vs variables: por defecto el costo de ventas es variable y los gastos de operación fijos. Ajustá cuentas
        puntuales (ej. comisiones de datáfono) en “Ajustar costos fijos/variables”. La meta diaria usa los días con venta
        real del mes ({dias}).
      </p>
    </div>
  );
}

function Renglon({ k, v, fuerte, tono }: { k: string; v: string; fuerte?: boolean; tono?: "verde" | "rojo" }) {
  const c = tono === "verde" ? "text-green-700" : tono === "rojo" ? "text-red-700" : "text-neutral-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-600">{k}</span>
      <span className={`tabular-nums ${fuerte ? "text-base font-semibold" : ""} ${c}`}>{v}</span>
    </div>
  );
}

function Fila({ k, v, sub, fuerte, total }: { k: string; v: number; sub?: string; fuerte?: boolean; total?: boolean }) {
  return (
    <tr className={total ? "bg-neutral-50/70 font-semibold text-neutral-900" : fuerte ? "font-medium text-neutral-800" : "text-neutral-700"}>
      <td className="px-4 py-2">{k}</td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-400">{sub ?? ""}</td>
      <td className={`px-4 py-2 text-right tabular-nums ${v < 0 ? "text-red-700" : ""}`}>{money2(v)}</td>
    </tr>
  );
}

function FilaTxt({ k, v, ayuda, tono }: { k: string; v: string; ayuda: string; tono?: "verde" | "rojo" }) {
  const c = tono === "verde" ? "text-green-700" : tono === "rojo" ? "text-red-700" : "text-neutral-900";
  return (
    <tr className="text-neutral-700">
      <td className="px-4 py-2">
        <div className="font-medium text-neutral-800">{k}</div>
        <div className="text-xs text-neutral-400">{ayuda}</div>
      </td>
      <td className={`px-4 py-2 text-right text-base font-semibold tabular-nums ${c}`}>{v}</td>
    </tr>
  );
}
