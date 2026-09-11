"use client";

import { useState } from "react";

interface Seg {
  centro: string;
  nombre: string;
  ventas: number;
  contribucion: number;
  mcPct: number;
  fijosDirectos: number;
  fijosCompartidos: number;
  utilidadReportada: number;
  aporte: number;
}
interface Data {
  etiquetaSel: string;
  utilidadActual: number;
  costosCompartidos: number;
  segmentos: Seg[];
}

const money0 = (n: number) => (n < 0 ? "−₡" : "₡") + Math.round(Math.abs(n)).toLocaleString("es-CR");
const pct = (x: number) => (x * 100).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

export default function EscenariosSucursales({ data }: { data: Data }) {
  const conVentas = data.segmentos.filter((s) => s.ventas > 0 || s.fijosDirectos > 0);
  // Candidata por defecto: la de menor aporte (la que "menos pesa").
  const candidata = [...conVentas].sort((a, b) => a.aporte - b.aporte)[0]?.centro ?? "";
  const [sel, setSel] = useState(candidata);
  const [migracion, setMigracion] = useState(0); // % de ventas que se pasan a otras sucursales

  const s = conVentas.find((x) => x.centro === sel) ?? conVentas[0];

  // Cerrar `s`: se pierde su contribución, se ahorran sus fijos directos, y una
  // fracción `migracion` de su contribución se recupera en las otras sucursales.
  const m = migracion / 100;
  const recuperado = s ? m * s.contribucion : 0;
  const cambio = s ? -s.aporte + recuperado : 0;
  const nuevaUtilidad = data.utilidadActual + cambio;
  const mejor = cambio > 0;
  // Traspaso mínimo para que cerrarla sea indiferente (si aporte>0).
  const breakeven = s && s.contribucion > 0 ? Math.max(0, Math.min(100, (s.aporte / s.contribucion) * 100)) : 0;

  return (
    <div className="space-y-4">
      {/* Tabla mantener-o-cerrar */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Sucursal</th>
              <th className="px-4 py-2 text-right font-medium">Ventas</th>
              <th className="px-4 py-2 text-right font-medium">Contribución</th>
              <th className="px-4 py-2 text-right font-medium">− Fijos directos</th>
              <th className="px-4 py-2 text-right font-medium">= Aporte real</th>
              <th className="px-4 py-2 text-right font-medium">Compartidos (se mantienen)</th>
              <th className="px-4 py-2 text-right font-medium">Utilidad contable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {conVentas.map((x) => (
              <tr key={x.centro} className={x.centro === sel ? "bg-indigo-50/40" : ""}>
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900">{x.centro}</div>
                  <div className="text-xs text-neutral-400">{x.nombre}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{money0(x.ventas)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                  {money0(x.contribucion)}
                  <div className="text-xs text-neutral-400">{pct(x.mcPct)}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{money0(x.fijosDirectos)}</td>
                <td className={`px-4 py-2 text-right text-base font-semibold tabular-nums ${x.aporte >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {money0(x.aporte)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-400">{money0(x.fijosCompartidos)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${x.utilidadReportada >= 0 ? "text-neutral-500" : "text-red-500"}`}>
                  {money0(x.utilidadReportada)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        <b>Aporte real</b> = contribución (ventas − costos variables) − fijos directos de la sucursal. Es lo que deja para
        pagar los costos compartidos y la utilidad. La <b>utilidad contable</b> (última columna) le resta además su parte
        del Taller y administración — costos que <b>no</b> desaparecen si cerrás la sucursal, por eso engañan. Aporte
        positivo = conviene mantenerla.
      </p>

      {/* Simulador de cierre */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-neutral-800">Simular: ¿qué pasa si cierro…</h2>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none"
          >
            {conVentas.map((x) => (
              <option key={x.centro} value={x.centro}>
                {x.centro} — {x.nombre}
              </option>
            ))}
          </select>
          <span className="text-sm text-neutral-500">· {data.etiquetaSel}</span>
        </div>

        {s && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Utilidad hoy (empresa)</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{money0(data.utilidadActual)}</div>
              </div>
              <div className={`rounded-lg border p-3 ${mejor ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40"}`}>
                <div className="text-xs uppercase tracking-wide text-neutral-500">Si cierro {s.centro}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${mejor ? "text-green-700" : "text-red-700"}`}>
                  {money0(nuevaUtilidad)}
                </div>
                <div className={`text-xs font-medium ${mejor ? "text-green-700" : "text-red-700"}`}>
                  {mejor ? "▲ mejora " : "▼ empeora "} {money0(Math.abs(cambio))}/mes
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Veredicto</div>
                <div className={`mt-1 text-sm font-semibold ${mejor ? "text-green-700" : "text-red-700"}`}>
                  {mejor ? `Conviene cerrar ${s.centro}` : `NO conviene cerrar ${s.centro}`}
                </div>
                <div className="text-xs text-neutral-500">
                  {s.aporte >= 0
                    ? `Cubre lo suyo y aporta ${money0(s.aporte)}/mes.`
                    : `Ni cubre sus costos directos (${money0(s.aporte)}/mes).`}
                </div>
              </div>
            </div>

            {/* Traspaso de clientes */}
            <div className="mt-4">
              <label className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                <span>Si cierro {s.centro}, se pasarían a las otras sucursales el</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={migracion}
                  onChange={(e) => setMigracion(Number(e.target.value))}
                  className="h-2 w-48 cursor-pointer"
                />
                <span className="w-12 font-semibold tabular-nums text-neutral-900">{migracion}%</span>
                <span className="text-neutral-500">de sus ventas.</span>
              </label>
              <p className="mt-2 text-sm text-neutral-600">
                {s.aporte < 0 ? (
                  <>Aun sin traspaso conviene cerrarla: no cubre sus propios costos.</>
                ) : (
                  <>
                    Punto de indiferencia: si al menos <b>{breakeven.toFixed(0)}%</b> de las ventas de {s.centro} se pasan a
                    las otras sucursales, cerrarla deja de costarte. Por debajo de eso, perdés plata al cerrarla.
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        Supuestos: al cerrar una sucursal se ahorran sus costos <b>variables</b> y sus fijos <b>directos</b>; los costos
        compartidos (Taller {money0(data.costosCompartidos)} entre todas) se mantienen. El traspaso asume que las ventas
        migradas dejan un margen parecido y caben en la capacidad actual de las otras sucursales. Los números salen del
        Estado de Resultados de {data.etiquetaSel}; un mes atípico puede sesgar la decisión — mirá varios meses.
      </p>
    </div>
  );
}
