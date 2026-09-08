"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ResumenCentro {
  ventas: number;
  costo: number;
  margenBruto: number;
  margenPct: number;
  gastos: number;
  utilidadOper: number;
  otrosIng: number;
  otrosGas: number;
  utilidad: number;
}

interface DashData {
  mesSel: string;
  etiquetaSel: string;
  etiquetaAnt: string;
  etiquetaAnioPasado: string;
  anioYTD: number;
  sel: ResumenCentro;
  ant: ResumenCentro;
  anioPasado: ResumenCentro;
  ytd: ResumenCentro;
  ytdPasado: ResumenCentro;
  hayAnioPasado: boolean;
  hayYtdPasado: boolean;
  centros: string[];
  porCentroSel: ({ centro: string } & ResumenCentro)[];
  serie: Record<string, number | string>[];
  ventasDia: { dia: string; fecha: string; total: number }[];
}

// Paleta contenida: cromo del ERP en gris, series con pocos tonos apagados.
const COLOR = { ventas: "#171717", margen: "#0d9488", utilidad: "#4f46e5", gastos: "#b45309" };
const COLOR_CENTRO = ["#0d9488", "#b45309", "#4f46e5", "#2563eb", "#be123c", "#65a30d"];

const money0 = (n: number) => "₡" + Math.round(n).toLocaleString("es-CR");
const money2 = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => (x * 100).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return "₡" + (n / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return "₡" + Math.round(n / 1_000) + "k";
  return "₡" + Math.round(n);
};

function Delta({ cur, prev, buenoSubir = true }: { cur: number; prev: number; buenoSubir?: boolean }) {
  if (!prev) return <span className="text-xs text-neutral-400">— sin base</span>;
  const d = (cur - prev) / Math.abs(prev);
  const sube = cur >= prev;
  const bueno = sube === buenoSubir;
  return (
    <span className={`text-xs font-medium ${bueno ? "text-green-600" : "text-red-600"}`}>
      {sube ? "▲" : "▼"} {pct(Math.abs(d))}
    </span>
  );
}

function Kpi({
  label,
  valor,
  sub,
  cur,
  prev,
  buenoSubir = true,
}: {
  label: string;
  valor: string;
  sub?: string;
  cur: number;
  prev: number;
  buenoSubir?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900 tabular-nums">{valor}</div>
      <div className="mt-1 flex items-center gap-2">
        <Delta cur={cur} prev={prev} buenoSubir={buenoSubir} />
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
    </div>
  );
}

const ttStyle = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" },
  labelStyle: { color: "#525252" },
};

export default function DashboardVentas({ data }: { data: DashData }) {
  const [vista, setVista] = useState<"total" | "sucursal">("total");
  const s = data.sel;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Ventas · ${data.etiquetaSel}`} valor={money0(s.ventas)} cur={s.ventas} prev={data.ant.ventas} sub={`vs ${data.etiquetaAnt}`} />
        <Kpi label="Margen bruto" valor={money0(s.margenBruto)} sub={pct(s.margenPct) + " margen"} cur={s.margenBruto} prev={data.ant.margenBruto} />
        <Kpi label="Gastos operación" valor={money0(s.gastos)} cur={s.gastos} prev={data.ant.gastos} buenoSubir={false} sub={`vs ${data.etiquetaAnt}`} />
        <Kpi label="Utilidad" valor={money0(s.utilidad)} cur={s.utilidad} prev={data.ant.utilidad} sub={`vs ${data.etiquetaAnt}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Tendencia 12 meses */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">Tendencia (12 meses)</h2>
            <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs">
              <button
                onClick={() => setVista("total")}
                className={`px-2 py-1 ${vista === "total" ? "bg-neutral-800 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
              >
                Financiero
              </button>
              <button
                onClick={() => setVista("sucursal")}
                className={`px-2 py-1 ${vista === "sucursal" ? "bg-neutral-800 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
              >
                Por sucursal
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.serie} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#737373" }} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#737373" }} width={52} />
              <Tooltip formatter={(v) => money2(Number(v))} {...ttStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {vista === "total" ? (
                <>
                  <Line type="monotone" dataKey="ventas" name="Ventas" stroke={COLOR.ventas} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="margen" name="Margen bruto" stroke={COLOR.margen} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke={COLOR.utilidad} strokeWidth={2} dot={false} />
                </>
              ) : (
                data.centros.map((c, i) => (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={`v_${c}`}
                    name={c}
                    stroke={COLOR_CENTRO[i % COLOR_CENTRO.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Ventas por sucursal del mes */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">Por sucursal · {data.etiquetaSel}</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.porCentroSel} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="centro" tick={{ fontSize: 11, fill: "#737373" }} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#737373" }} width={52} />
              <Tooltip formatter={(v) => money2(Number(v))} {...ttStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ventas" name="Ventas" fill={COLOR.ventas} radius={[3, 3, 0, 0]} />
              <Bar dataKey="utilidad" name="Utilidad" fill={COLOR.margen} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ventas por día */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-800">Ventas por día · {data.etiquetaSel}</h2>
        {data.ventasDia.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">Sin ventas confirmadas en este mes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.ventasDia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#737373" }} interval={0} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#737373" }} width={52} />
              <Tooltip formatter={(v) => money2(Number(v))} labelFormatter={(l) => `Día ${l}`} {...ttStyle} />
              <Bar dataKey="total" name="Ventas netas" fill={COLOR.ventas} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Comparativo */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Concepto</th>
              <th className="px-4 py-2 text-right font-medium">{data.etiquetaSel}</th>
              <th className="px-4 py-2 text-right font-medium">{data.etiquetaAnt}</th>
              <th className="px-4 py-2 text-right font-medium">Δ</th>
              <th className="px-4 py-2 text-right font-medium">{data.etiquetaAnioPasado}</th>
              <th className="px-4 py-2 text-right font-medium">YTD {data.anioYTD}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            <FilaComp label="Ventas" sel={s.ventas} ant={data.ant.ventas} ap={data.anioPasado.ventas} ytd={data.ytd.ventas} hayAp={data.hayAnioPasado} />
            <FilaComp label="Costo de ventas" sel={s.costo} ant={data.ant.costo} ap={data.anioPasado.costo} ytd={data.ytd.costo} hayAp={data.hayAnioPasado} buenoSubir={false} />
            <FilaComp label="Margen bruto" sel={s.margenBruto} ant={data.ant.margenBruto} ap={data.anioPasado.margenBruto} ytd={data.ytd.margenBruto} hayAp={data.hayAnioPasado} fuerte />
            <tr className="text-neutral-600">
              <td className="px-4 py-2">Margen %</td>
              <td className="px-4 py-2 text-right tabular-nums">{pct(s.margenPct)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{pct(data.ant.margenPct)}</td>
              <td className="px-4 py-2 text-right">
                <Delta cur={s.margenPct} prev={data.ant.margenPct} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{data.hayAnioPasado ? pct(data.anioPasado.margenPct) : "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{pct(data.ytd.margenPct)}</td>
            </tr>
            <FilaComp label="Gastos de operación" sel={s.gastos} ant={data.ant.gastos} ap={data.anioPasado.gastos} ytd={data.ytd.gastos} hayAp={data.hayAnioPasado} buenoSubir={false} />
            <FilaComp label="Utilidad" sel={s.utilidad} ant={data.ant.utilidad} ap={data.anioPasado.utilidad} ytd={data.ytd.utilidad} hayAp={data.hayAnioPasado} fuerte />
          </tbody>
        </table>
      </div>

      {!data.hayAnioPasado && (
        <p className="text-xs text-neutral-400">
          La columna “{data.etiquetaAnioPasado}” aparece vacía porque todavía no hay datos de ese periodo. Se llenará sola
          cuando el sistema acumule un año de historia.
        </p>
      )}
    </div>
  );
}

function FilaComp({
  label,
  sel,
  ant,
  ap,
  ytd,
  hayAp,
  fuerte = false,
  buenoSubir = true,
}: {
  label: string;
  sel: number;
  ant: number;
  ap: number;
  ytd: number;
  hayAp: boolean;
  fuerte?: boolean;
  buenoSubir?: boolean;
}) {
  return (
    <tr className={fuerte ? "bg-neutral-50/60 font-semibold text-neutral-900" : "text-neutral-700"}>
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{money2(sel)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{money2(ant)}</td>
      <td className="px-4 py-2 text-right">
        <Delta cur={sel} prev={ant} buenoSubir={buenoSubir} />
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{hayAp ? money2(ap) : "—"}</td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{money2(ytd)}</td>
    </tr>
  );
}
