"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CentroFlujo } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Rol de cada centro para el simulador.
function rolCentro(cod: string): "final" | "apoyo" | "casa" | "sinneg" {
  if (cod === "TAL" || cod === "GEN") return "apoyo";
  if (cod === "CAS") return "casa";
  if (cod === "SINNEG") return "sinneg";
  return "final"; // CH1, CH2, VEX
}

type Item = {
  id: string;
  centroCod: string;
  centroNom: string;
  rol: "final" | "apoyo" | "casa" | "sinneg";
  lado: "entrada" | "salida";
  categoria: string;
  cuentaNom: string;
  signed: number; // + entra, - sale
};

// Orden: la panadería que cierra primero, luego el resto de panaderías (por neto),
// luego apoyo (Taller/General), Casa y de último Sin negocio.
function ordenCentro(cod: string, cierra: string): number {
  if (cod === cierra) return 0;
  const r = rolCentro(cod);
  if (r === "final") return 1;
  if (r === "apoyo") return 2;
  if (r === "casa") return 3;
  return 4; // sinneg
}

export default function SimuladorCierrePanel({ centros, etiquetaMes }: { centros: CentroFlujo[]; etiquetaMes: string }) {
  const finales = centros.filter((c) => rolCentro(c.centro_codigo) === "final");
  const [cierra, setCierra] = useState<string>(
    finales.find((c) => c.centro_codigo === "CH1")?.centro_codigo ?? finales[0]?.centro_codigo ?? "",
  );

  // Todas las líneas con signo.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of centros) {
      const rol = rolCentro(c.centro_codigo);
      c.entradas.forEach((cat, ci) =>
        cat.lineas.forEach((l, li) =>
          out.push({ id: `${c.centro_codigo}#e#${ci}#${li}`, centroCod: c.centro_codigo, centroNom: c.centro_nombre, rol, lado: "entrada", categoria: cat.categoria, cuentaNom: l.cuenta_nombre, signed: Math.abs(l.monto) }),
        ),
      );
      c.salidas.forEach((cat, ci) =>
        cat.lineas.forEach((l, li) =>
          out.push({ id: `${c.centro_codigo}#s#${ci}#${li}`, centroCod: c.centro_codigo, centroNom: c.centro_nombre, rol, lado: "salida", categoria: cat.categoria, cuentaNom: l.cuenta_nombre, signed: -Math.abs(l.monto) }),
        ),
      );
    }
    return out;
  }, [centros]);

  // Qué líneas "se van" (desaparecen si cierra la panadería). Default: todo lo de la
  // panadería que cierra se va; el resto se queda.
  const [seVa, setSeVa] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const def: Record<string, boolean> = {};
    for (const it of items) def[it.id] = it.centroCod === cierra;
    setSeVa(def);
  }, [items, cierra]);

  const toggle = (id: string) => setSeVa((s) => ({ ...s, [id]: !s[id] }));
  const setCentro = (cod: string, val: boolean) =>
    setSeVa((s) => {
      const n = { ...s };
      for (const it of items) if (it.centroCod === cod) n[it.id] = val;
      return n;
    });

  // Cálculos.
  const r = useMemo(() => {
    let flujoActual = 0, ingresosPerdidos = 0, costosAhorrados = 0, aporteDirecto = 0;
    for (const it of items) {
      flujoActual += it.signed;
      if (it.centroCod === cierra) aporteDirecto += it.signed;
      if (seVa[it.id]) {
        if (it.signed >= 0) ingresosPerdidos += it.signed;
        else costosAhorrados += -it.signed;
      }
    }
    const efecto = costosAhorrados - ingresosPerdidos; // + mejora caja, - empeora
    const flujoProyectado = flujoActual + efecto;
    return { flujoActual, ingresosPerdidos, costosAhorrados, efecto, flujoProyectado, aporteDirecto };
  }, [items, seVa, cierra]);

  const centrosOrden = [...centros].sort((a, b) => {
    const oa = ordenCentro(a.centro_codigo, cierra), ob = ordenCentro(b.centro_codigo, cierra);
    if (oa !== ob) return oa - ob;
    return b.neto - a.neto;
  });

  const nombreCierra = centros.find((c) => c.centro_codigo === cierra)?.centro_nombre ?? cierra;

  const Signo = ({ n }: { n: number }) => (
    <span className={`tabular-nums ${n >= 0 ? "text-green-700" : "text-red-600"}`}>
      {n < 0 ? `(${money(-n)})` : money(n)}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Selector de panadería a cerrar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-700">Si cierro:</span>
        {finales.map((c) => (
          <button
            key={c.centro_codigo}
            onClick={() => setCierra(c.centro_codigo)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              cierra === c.centro_codigo
                ? "border-neutral-900 bg-neutral-900 font-medium text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {c.centro_nombre}
          </button>
        ))}
        <span className="ml-1 text-xs text-neutral-500">· {etiquetaMes}</span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Flujo actual del mes</div>
          <div className="text-base font-semibold"><Signo n={r.flujoActual} /></div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">{nombreCierra} aporta hoy (caja directa)</div>
          <div className="text-base font-semibold"><Signo n={r.aporteDirecto} /></div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Flujo proyectado (si cierra)</div>
          <div className="text-base font-semibold"><Signo n={r.flujoProyectado} /></div>
        </div>
        <div className={`rounded-lg border p-3 ${r.efecto >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <div className="text-xs text-neutral-600">Efecto de cerrar</div>
          <div className={`text-base font-semibold tabular-nums ${r.efecto >= 0 ? "text-green-800" : "text-red-700"}`}>
            {r.efecto >= 0 ? "+" : "−"} {money(Math.abs(r.efecto))}
          </div>
        </div>
      </div>

      {/* Veredicto */}
      <div className={`rounded-lg border px-4 py-3 text-sm ${r.efecto >= 0 ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
        {r.efecto >= 0 ? (
          <>En este escenario, cerrar <b>{nombreCierra}</b> <b>mejoraría</b> tu caja en <b>₡{money(r.efecto)}</b> al mes
          (te ahorrás ₡{money(r.costosAhorrados)} en costos y perdés ₡{money(r.ingresosPerdidos)} de ingresos).</>
        ) : (
          <>En este escenario, cerrar <b>{nombreCierra}</b> <b>empeoraría</b> tu caja en <b>₡{money(-r.efecto)}</b> al mes
          (perdés ₡{money(r.ingresosPerdidos)} de ingresos y solo te ahorrás ₡{money(r.costosAhorrados)} en costos).</>
        )}
      </div>

      {/* Aviso centros de apoyo */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <b>Ojo con Taller y General:</b> al cerrar {nombreCierra} esos costos <b>no desaparecen solos</b> — la producción y
        la administración siguen para las otras panaderías. Por defecto los dejo como <b>&quot;se queda&quot;</b>. Marcá
        solo lo que de verdad te ahorrarías (ej. menos personal de producción) para ver el efecto real. Lo mismo con
        <b> Sin negocio</b>: los préstamos se siguen debiendo; el IVA sí bajaría al vender menos.
      </div>

      {/* Secciones por centro */}
      <div className="space-y-3">
        {centrosOrden.map((c) => {
          const its = items.filter((x) => x.centroCod === c.centro_codigo);
          if (its.length === 0) return null;
          const esCierra = c.centro_codigo === cierra;
          const nSeVa = its.filter((x) => seVa[x.id]).length;
          const todos = nSeVa === its.length, ninguno = nSeVa === 0;
          return (
            <div key={c.centro_codigo} className={`overflow-hidden rounded-lg border ${esCierra ? "border-neutral-900" : "border-neutral-200"} bg-white`}>
              <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${esCierra ? "bg-neutral-900 text-white" : "bg-neutral-50 text-neutral-800"}`}>
                <div className="text-sm font-semibold">
                  {c.centro_nombre}
                  {esCierra && <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px]">cierra</span>}
                  {rolCentro(c.centro_codigo) === "apoyo" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">apoyo</span>}
                  <span className={`ml-2 text-xs font-normal ${esCierra ? "text-neutral-300" : "text-neutral-500"}`}>
                    neto <Signo n={c.neto} />
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={esCierra ? "text-neutral-300" : "text-neutral-500"}>{nSeVa}/{its.length} se va</span>
                  <button onClick={() => setCentro(c.centro_codigo, true)} disabled={todos}
                    className={`rounded border px-2 py-0.5 ${esCierra ? "border-white/40 hover:bg-white/10 disabled:opacity-40" : "border-neutral-300 hover:bg-neutral-100 disabled:opacity-40"}`}>
                    Todo se va
                  </button>
                  <button onClick={() => setCentro(c.centro_codigo, false)} disabled={ninguno}
                    className={`rounded border px-2 py-0.5 ${esCierra ? "border-white/40 hover:bg-white/10 disabled:opacity-40" : "border-neutral-300 hover:bg-neutral-100 disabled:opacity-40"}`}>
                    Todo se queda
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {its.map((it) => {
                    const va = !!seVa[it.id];
                    return (
                      <tr key={it.id} className={va ? "bg-red-50/40" : ""}>
                        <td className="w-8 pl-3">
                          <input type="checkbox" checked={va} onChange={() => toggle(it.id)} className="h-4 w-4 cursor-pointer accent-neutral-900" />
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className="text-neutral-700">{it.cuentaNom}</span>
                          <span className="ml-2 text-[11px] text-neutral-400">{it.categoria}</span>
                        </td>
                        <td className="px-4 py-1.5 text-right"><Signo n={it.signed} /></td>
                        <td className="w-20 pr-4 text-right text-[11px] font-medium">
                          <span className={va ? "text-red-600" : "text-neutral-400"}>{va ? "se va" : "se queda"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Reconciliación: nada se pierde */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
        <b>Todo cuadra:</b> {items.length} líneas en total · se va {money(r.ingresosPerdidos - r.costosAhorrados)} ·
        se queda <Signo n={r.flujoProyectado} />. Flujo actual <Signo n={r.flujoActual} /> = lo que se queda + lo que se va.
        Cada línea está clasificada (se va o se queda), nada queda por fuera.
      </div>
    </div>
  );
}
