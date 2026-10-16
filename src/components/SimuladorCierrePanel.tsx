"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CentroFlujo, CentroPendiente } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rolCentro(cod: string): "final" | "apoyo" | "casa" | "sinneg" {
  if (cod === "TAL" || cod === "GEN") return "apoyo";
  if (cod === "CAS") return "casa";
  if (cod === "SINNEG") return "sinneg";
  return "final"; // CH1, CH2, VEX
}

type Reparto = Record<string, Record<string, number>>; // apoyo -> final -> fracción 0..1
type Bloque = "propio" | "taller" | "general" | "casa";
type Item = {
  id: string;
  bloque: Bloque;
  lado: "entrada" | "salida";
  nombre: string;
  base: number; // monto al 100% (con signo): propio = su línea; taller/general/casa = total del centro
  editablePct: boolean; // taller/general/casa dejan ajustar el %
  defaultPct: number;
};

export default function SimuladorCierrePanel({
  centros,
  etiquetaMes,
  reparto,
  pendientes,
  disponible,
  fechaCorte,
}: {
  centros: CentroFlujo[];
  etiquetaMes: string;
  reparto: Reparto;
  pendientes: CentroPendiente[];
  disponible: number;
  fechaCorte: string;
}) {
  const finales = centros.filter((c) => rolCentro(c.centro_codigo) === "final");
  const [cierra, setCierra] = useState<string>(
    finales.find((c) => c.centro_codigo === "CH1")?.centro_codigo ?? finales[0]?.centro_codigo ?? "",
  );

  const nombreCierra = centros.find((c) => c.centro_codigo === cierra)?.centro_nombre ?? cierra;
  const shareTAL = reparto["TAL"]?.[cierra] ?? 0;
  const shareGEN = reparto["GEN"]?.[cierra] ?? 0;
  const pct1 = (x: number) => Math.round(x * 1000) / 10;

  // Líneas marcables, por bloque.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const add = (centro: CentroFlujo | undefined, bloque: Bloque, editablePct: boolean, defaultPct: number) => {
      if (!centro) return;
      for (const cat of centro.entradas)
        if (cat.total !== 0) out.push({ id: `${bloque}#e#${cat.categoria}`, bloque, lado: "entrada", nombre: cat.categoria, base: cat.total, editablePct, defaultPct });
      for (const cat of centro.salidas)
        if (cat.total !== 0) out.push({ id: `${bloque}#s#${cat.categoria}`, bloque, lado: "salida", nombre: cat.categoria, base: -cat.total, editablePct, defaultPct });
    };
    add(centros.find((c) => c.centro_codigo === cierra), "propio", false, 100);
    if (shareTAL > 0) add(centros.find((c) => c.centro_codigo === "TAL"), "taller", true, pct1(shareTAL));
    if (shareGEN > 0) add(centros.find((c) => c.centro_codigo === "GEN"), "general", true, pct1(shareGEN));
    add(centros.find((c) => c.centro_codigo === "CAS"), "casa", true, 100);
    return out;
  }, [centros, cierra, shareTAL, shareGEN]);

  // Default: lo del cierre (propio/taller/general) viene marcado; Casa NO (la recortás a gusto).
  const [seVa, setSeVa] = useState<Record<string, boolean>>({});
  const [pctL, setPctL] = useState<Record<string, number>>({});
  useEffect(() => {
    const sv: Record<string, boolean> = {};
    const pl: Record<string, number> = {};
    for (const it of items) { sv[it.id] = it.bloque !== "casa"; pl[it.id] = it.defaultPct; }
    setSeVa(sv); setPctL(pl);
  }, [items]);

  const toggle = (id: string) => setSeVa((s) => ({ ...s, [id]: !s[id] }));
  const setGrupo = (bloque: Bloque, val: boolean) =>
    setSeVa((s) => { const n = { ...s }; for (const it of items) if (it.bloque === bloque) n[it.id] = val; return n; });
  const setPct = (id: string, v: number) => setPctL((s) => ({ ...s, [id]: Math.max(0, Math.min(100, v)) }));
  const efectivo = (it: Item) => (it.editablePct ? it.base * ((pctL[it.id] ?? it.defaultPct) / 100) : it.base);

  const flujoActual = useMemo(() => centros.reduce((s, c) => s + c.neto, 0), [centros]);
  const r = useMemo(() => {
    let ing = 0, cost = 0;
    for (const it of items) if (seVa[it.id]) { const e = efectivo(it); if (e >= 0) ing += e; else cost += -e; }
    const efecto = cost - ing;
    return { ing, cost, efecto, flujoProyectado: flujoActual + efecto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, seVa, pctL, flujoActual]);

  // Centros que NO cambian al cerrar (otras panaderías + Sin negocio; Casa ya es su propio bloque).
  const noCambian = centros.filter((c) => c.centro_codigo !== cierra && rolCentro(c.centro_codigo) !== "apoyo" && rolCentro(c.centro_codigo) !== "casa");

  // ---- Pendiente de pagar ----
  const pendItems = useMemo(() => {
    const out: { id: string; centro: string; categoria: string; bucket: "venc" | "porv"; saldo: number }[] = [];
    for (const p of pendientes)
      for (const cat of p.categorias) {
        if (cat.vencido > 0) out.push({ id: `${p.centro_codigo}|${cat.categoria}|venc`, centro: p.centro_codigo, categoria: cat.categoria, bucket: "venc", saldo: cat.vencido });
        if (cat.porVencer > 0) out.push({ id: `${p.centro_codigo}|${cat.categoria}|porv`, centro: p.centro_codigo, categoria: cat.categoria, bucket: "porv", saldo: cat.porVencer });
      }
    return out;
  }, [pendientes]);
  const [incluido, setIncluido] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const d: Record<string, boolean> = {};
    for (const it of pendItems) d[it.id] = it.bucket === "venc";
    setIncluido(d);
  }, [pendItems]);
  const toggleItem = (id: string) => setIncluido((s) => ({ ...s, [id]: !s[id] }));
  const setPreset = (modo: "venc" | "todo" | "nada") =>
    setIncluido(() => { const d: Record<string, boolean> = {}; for (const it of pendItems) d[it.id] = modo === "todo" ? true : modo === "nada" ? false : it.bucket === "venc"; return d; });
  const totalPendiente = useMemo(() => pendientes.reduce((s, p) => s + p.pendiente, 0), [pendientes]);
  const totalVencido = useMemo(() => pendientes.reduce((s, p) => s + p.vencido, 0), [pendientes]);
  const seleccionado = useMemo(() => pendItems.reduce((s, it) => s + (incluido[it.id] ? it.saldo : 0), 0), [pendItems, incluido]);
  const meQueda = disponible - seleccionado;
  const mesesRecuperar = r.efecto > 0 && meQueda < 0 ? Math.ceil(-meQueda / r.efecto) : null;
  const fCorte = (() => { const p = (fechaCorte || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : fechaCorte; })();

  const Signo = ({ n }: { n: number }) => (
    <span className={`tabular-nums ${n >= 0 ? "text-green-700" : "text-red-600"}`}>
      {n < 0 ? `(${money(-n)})` : money(n)}
    </span>
  );

  const GrupoCard = ({ bloque, titulo, subtitulo }: { bloque: Bloque; titulo: string; subtitulo?: string }) => {
    const its = items.filter((x) => x.bloque === bloque);
    if (its.length === 0) return null;
    const nSeVa = its.filter((x) => seVa[x.id]).length;
    const efectoGrupo = -its.reduce((s, x) => s + (seVa[x.id] ? efectivo(x) : 0), 0);
    const fila = (it: Item) => {
      const on = !!seVa[it.id];
      return (
        <tr key={it.id} className={on ? "" : "opacity-45"}>
          <td className="py-1.5 pl-3 pr-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={on} onChange={() => toggle(it.id)} className="h-4 w-4 accent-neutral-900" />
              <span className="text-neutral-700">{it.nombre}</span>
            </label>
          </td>
          <td className="w-20 px-1 py-1 text-right">
            {it.editablePct && (
              <span className="inline-flex items-center gap-0.5" title={`de ${money(Math.abs(it.base))}`}>
                <input type="number" min={0} max={100} value={pctL[it.id] ?? it.defaultPct}
                  onChange={(e) => setPct(it.id, Number(e.target.value))}
                  className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right text-xs tabular-nums" />
                <span className="text-[11px] text-neutral-400">%</span>
              </span>
            )}
          </td>
          <td className="w-32 px-4 py-1.5 text-right"><Signo n={efectivo(it)} /></td>
          <td className="w-16 pr-3 text-right text-[11px] font-medium text-neutral-400">{on ? "se va" : "se queda"}</td>
        </tr>
      );
    };
    const entradas = its.filter((x) => x.lado === "entrada");
    const salidas = its.filter((x) => x.lado === "salida");
    return (
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-100 px-4 py-2">
          <div>
            <span className="text-sm font-semibold text-neutral-800">{titulo}</span>
            {subtitulo && <span className="ml-2 text-xs text-neutral-500">{subtitulo}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500">{nSeVa}/{its.length} · ahorro neto</span>
            <span className={`font-semibold tabular-nums ${efectoGrupo >= 0 ? "text-green-700" : "text-red-600"}`}>
              {efectoGrupo >= 0 ? "+" : "−"}{money(Math.abs(efectoGrupo))}
            </span>
            <button onClick={() => setGrupo(bloque, true)} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-50">Todo</button>
            <button onClick={() => setGrupo(bloque, false)} className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-50">Nada</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {entradas.length > 0 && (
              <>
                <tr><td colSpan={4} className="bg-green-50/50 px-4 py-0.5 text-[11px] font-medium uppercase tracking-wide text-green-700">Entra</td></tr>
                {entradas.map(fila)}
              </>
            )}
            {salidas.length > 0 && (
              <>
                <tr><td colSpan={4} className="bg-red-50/50 px-4 py-0.5 text-[11px] font-medium uppercase tracking-wide text-red-700">Sale</td></tr>
                {salidas.map(fila)}
              </>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Selector de panadería a cerrar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-700">Si cierro:</span>
        {finales.map((c) => (
          <button key={c.centro_codigo} onClick={() => setCierra(c.centro_codigo)}
            className={`rounded-md border px-3 py-1.5 text-sm ${cierra === c.centro_codigo ? "border-neutral-900 bg-neutral-900 font-medium text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"}`}>
            {c.centro_nombre}
          </button>
        ))}
        <span className="ml-1 text-xs text-neutral-500">· {etiquetaMes}</span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Flujo actual del mes</div>
          <div className="text-base font-semibold"><Signo n={flujoActual} /></div>
        </div>
        <div className={`rounded-lg border p-3 ${r.efecto >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <div className="text-xs text-neutral-600">Efecto de los cambios</div>
          <div className={`text-base font-semibold tabular-nums ${r.efecto >= 0 ? "text-green-800" : "text-red-700"}`}>
            {r.efecto >= 0 ? "+" : "−"} {money(Math.abs(r.efecto))}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Flujo proyectado</div>
          <div className="text-base font-semibold"><Signo n={r.flujoProyectado} /></div>
        </div>
      </div>

      {/* Veredicto */}
      <div className={`rounded-lg border px-4 py-3 text-sm ${r.efecto >= 0 ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
        {r.efecto >= 0 ? (
          <>Con lo que marcaste, tu caja <b>mejoraría</b> en <b>₡{money(r.efecto)}</b> al mes — te ahorrás ₡{money(r.cost)} y perdés ₡{money(r.ing)} de ingresos.</>
        ) : (
          <>Con lo que marcaste, tu caja <b>empeoraría</b> en <b>₡{money(-r.efecto)}</b> al mes — perdés ₡{money(r.ing)} de ingresos y solo te ahorrás ₡{money(r.cost)}.</>
        )}
      </div>

      {/* Instrucción */}
      <p className="text-xs text-neutral-500">
        Marcá <b>lo que se va</b> si cerrás {nombreCierra}. De Taller y General solo aparece <b>la parte de {nombreCierra}</b> y
        podés ajustar el <b>%</b> por línea (quizá de la harina consume más y de la producción menos). Desmarcá lo que en
        realidad se queda (ej. un empleado que no despedís). <b>Casa</b> es tu gasto personal: marcá y ponele % a lo que recortarías.
      </p>

      {/* Bloques del cierre */}
      <div className="space-y-3">
        <GrupoCard bloque="propio" titulo={`Lo propio de ${nombreCierra}`} subtitulo="sus ventas, IVA, salarios y gastos directos" />
        <GrupoCard bloque="taller" titulo={`Parte de ${nombreCierra} en Taller`} subtitulo={`su ${pct1(shareTAL)}% — harina, insumos, producción (ajustable)`} />
        <GrupoCard bloque="general" titulo={`Parte de ${nombreCierra} en General`} subtitulo={`su ${pct1(shareGEN)}% — administración, combustible… (ajustable)`} />
        {shareTAL === 0 && shareGEN === 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este mes no hay prorrateo corrido, así que no puedo mostrar la parte de Taller/General. Corré el prorrateo del mes para verla.
          </p>
        )}
      </div>

      {/* Otros recortes (no son del cierre) */}
      {items.some((x) => x.bloque === "casa") && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Otros recortes (opcional, no son del cierre)</p>
          <GrupoCard bloque="casa" titulo="Casa — gasto personal / no deducible" subtitulo="marcá y ponele % a lo que recortarías del gasto personal" />
        </div>
      )}

      {/* No cambian */}
      {noCambian.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
          <b>No cambian</b> (siguen igual): {noCambian.map((c) => (
            <span key={c.centro_codigo} className="mr-3 whitespace-nowrap">{c.centro_nombre} <Signo n={c.neto} /></span>
          ))}. El resto de Taller y General (lo de las otras panaderías) también se queda.
        </div>
      )}

      {/* Resultado combinado con lo pendiente */}
      <div className="rounded-lg border-2 border-neutral-800 bg-neutral-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-neutral-600">Flujo del mes (con lo que marcaste)</span>
          <span className="font-medium"><Signo n={r.flujoProyectado} /></span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-neutral-600">− Pendiente que pagás (lo marcado abajo ⬇)</span>
          <span className="font-medium tabular-nums text-red-600">− {money(seleccionado)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-300 pt-2 text-base font-bold">
          <span className="text-neutral-800">= Te queda este mes</span>
          <span className={`tabular-nums ${r.flujoProyectado - seleccionado >= 0 ? "text-green-700" : "text-red-700"}`}>
            {r.flujoProyectado - seleccionado < 0 ? `(${money(seleccionado - r.flujoProyectado)})` : money(r.flujoProyectado - seleccionado)}
          </span>
        </div>
      </div>

      {/* ¿Me alcanza para pagar lo pendiente? */}
      <div className="mt-2 overflow-hidden rounded-lg border border-neutral-300 bg-white">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
          💸 ¿Me alcanza para pagar lo pendiente? <span className="font-normal text-neutral-500">— al {fCorte}</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-500">Tengo (caja + bancos)</div>
            <div className="text-lg font-semibold tabular-nums text-neutral-900">{money(disponible)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Pago lo marcado</div>
            <div className="text-lg font-semibold tabular-nums text-red-700">{money(seleccionado)}</div>
          </div>
          <div className={`rounded-md p-2 ${meQueda < 0 ? "bg-red-50" : "bg-green-50"}`}>
            <div className="text-xs text-neutral-500">Me queda en el banco</div>
            <div className={`text-lg font-semibold tabular-nums ${meQueda < 0 ? "text-red-700" : "text-green-800"}`}>
              {meQueda < 0 ? `(${money(-meQueda)})` : money(meQueda)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 bg-neutral-50/50 px-4 py-2 text-xs">
          <span className="text-neutral-500">Meter en el flujo:</span>
          <button onClick={() => setPreset("venc")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Solo lo vencido</button>
          <button onClick={() => setPreset("todo")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Todo</button>
          <button onClick={() => setPreset("nada")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Nada</button>
          <span className="ml-auto text-neutral-500">
            Marcado <b className="tabular-nums text-neutral-700">{money(seleccionado)}</b> de {money(totalPendiente)} · vencido total {money(totalVencido)}
          </span>
        </div>

        <table className="w-full border-t border-neutral-100 text-sm">
          <tbody className="divide-y divide-neutral-100">
            {pendientes.map((p) => {
              const esCierra = p.centro_codigo === cierra;
              return (
                <Fragment key={p.centro_codigo}>
                  <tr className="bg-neutral-50/70">
                    <td className="px-4 py-1.5 font-medium text-neutral-800" colSpan={2}>
                      {p.centro_nombre}
                      {esCierra && <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] text-white">cierra</span>}
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        debe {money(p.pendiente)} · vencido {money(p.vencido)}{p.porVencer > 0 && <> · por vencer {money(p.porVencer)}</>}
                      </span>
                    </td>
                  </tr>
                  {p.categorias.flatMap((cat) => {
                    const filas: { id: string; etiqueta: string; venc: boolean; monto: number }[] = [];
                    if (cat.vencido > 0) filas.push({ id: `${p.centro_codigo}|${cat.categoria}|venc`, etiqueta: cat.categoria, venc: true, monto: cat.vencido });
                    if (cat.porVencer > 0) filas.push({ id: `${p.centro_codigo}|${cat.categoria}|porv`, etiqueta: cat.categoria, venc: false, monto: cat.porVencer });
                    return filas.map((fp) => {
                      const on = !!incluido[fp.id];
                      return (
                        <tr key={fp.id} className={on ? "" : "opacity-50"}>
                          <td className="py-1 pl-8 pr-3">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input type="checkbox" checked={on} onChange={() => toggleItem(fp.id)} className="h-4 w-4 accent-neutral-900" />
                              <span className="text-neutral-700">{fp.etiqueta}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${fp.venc ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {fp.venc ? "vencido" : "por vencer"}
                              </span>
                            </label>
                          </td>
                          <td className="px-4 py-1 text-right tabular-nums text-neutral-600">{money(fp.monto)}</td>
                        </tr>
                      );
                    });
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="space-y-1 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-600">
          <p>
            Es lo <b>devengado y aún no pagado</b> (lo que el flujo —base caja— no muestra). Por defecto solo lo
            <b className="text-red-700"> vencido</b>; lo <b className="text-amber-700">por vencer</b> aún no toca pagarlo.
            {meQueda < 0 && <b className="text-red-700"> Con lo marcado no alcanza: faltan ₡{money(-meQueda)}.</b>}
          </p>
          {mesesRecuperar !== null && (
            <p>Si aplicás los cambios de arriba, la caja mejora <b>₡{money(r.efecto)}/mes</b>, así que cubrir ese faltante tomaría <b>~{mesesRecuperar} mes{mesesRecuperar === 1 ? "" : "es"}</b>.</p>
          )}
          <p className="text-neutral-400">Nota: los <b>préstamos</b> bancarios (largo plazo, en cuotas) no se cuentan acá — es deuda operativa de corto plazo.</p>
        </div>
      </div>
    </div>
  );
}
