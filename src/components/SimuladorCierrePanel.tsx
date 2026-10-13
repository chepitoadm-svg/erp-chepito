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
function ordenCentro(cod: string, cierra: string): number {
  if (cod === cierra) return 0;
  const r = rolCentro(cod);
  if (r === "final") return 1;
  if (r === "apoyo") return 2;
  if (r === "casa") return 3;
  return 4;
}

type Reparto = Record<string, Record<string, number>>; // apoyo -> final -> fracción 0..1

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
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});

  // % que "se va" de cada centro al cerrar. Default:
  //  - la panadería que cierra: 100%
  //  - Taller/General: la PARTE de la que cierra (su % del prorrateo del mes)
  //  - el resto (otras panaderías, Casa, Sin negocio): 0%
  const defaults = useMemo(() => {
    const d: Record<string, number> = {};
    for (const c of centros) {
      const cod = c.centro_codigo;
      if (cod === cierra) d[cod] = 100;
      else if (rolCentro(cod) === "apoyo") d[cod] = Math.round((reparto[cod]?.[cierra] ?? 0) * 1000) / 10;
      else d[cod] = 0;
    }
    return d;
  }, [centros, cierra, reparto]);

  const [pct, setPct] = useState<Record<string, number>>({});
  useEffect(() => setPct(defaults), [defaults]);

  const setP = (cod: string, v: number) => setPct((s) => ({ ...s, [cod]: Math.max(0, Math.min(100, v)) }));

  const flujoActual = useMemo(() => centros.reduce((s, c) => s + c.neto, 0), [centros]);
  const aporteDirecto = centros.find((c) => c.centro_codigo === cierra)?.neto ?? 0;

  const r = useMemo(() => {
    let ingresosPerdidos = 0, costosAhorrados = 0;
    for (const c of centros) {
      const f = (pct[c.centro_codigo] ?? 0) / 100;
      if (f === 0) continue;
      ingresosPerdidos += c.entro * f; // entradas que se pierden
      costosAhorrados += c.salio * f; // salidas que se ahorran
    }
    const efecto = costosAhorrados - ingresosPerdidos; // + mejora, - empeora
    return { ingresosPerdidos, costosAhorrados, efecto, flujoProyectado: flujoActual + efecto };
  }, [centros, pct, flujoActual]);

  const centrosOrden = [...centros].sort((a, b) => {
    const oa = ordenCentro(a.centro_codigo, cierra), ob = ordenCentro(b.centro_codigo, cierra);
    if (oa !== ob) return oa - ob;
    return b.neto - a.neto;
  });

  const nombreCierra = centros.find((c) => c.centro_codigo === cierra)?.centro_nombre ?? cierra;

  // Pendiente de pagar: elegir qué meter en el flujo (default: solo lo vencido).
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
    for (const it of pendItems) d[it.id] = it.bucket === "venc"; // default: solo lo vencido
    setIncluido(d);
  }, [pendItems]);
  const toggleItem = (id: string) => setIncluido((s) => ({ ...s, [id]: !s[id] }));
  const setPreset = (modo: "venc" | "todo" | "nada") =>
    setIncluido(() => {
      const d: Record<string, boolean> = {};
      for (const it of pendItems) d[it.id] = modo === "todo" ? true : modo === "nada" ? false : it.bucket === "venc";
      return d;
    });

  const totalPendiente = useMemo(() => pendientes.reduce((s, p) => s + p.pendiente, 0), [pendientes]);
  const totalVencido = useMemo(() => pendientes.reduce((s, p) => s + p.vencido, 0), [pendientes]);
  const seleccionado = useMemo(() => pendItems.reduce((s, it) => s + (incluido[it.id] ? it.saldo : 0), 0), [pendItems, incluido]);
  const meQueda = disponible - seleccionado;
  const mesesRecuperar = r.efecto > 0 && meQueda < 0 ? Math.ceil(-meQueda / r.efecto) : null;
  const fCorte = (() => {
    const p = (fechaCorte || "").split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : fechaCorte;
  })();

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
          <div className="text-base font-semibold"><Signo n={flujoActual} /></div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">{nombreCierra} aporta hoy (caja directa)</div>
          <div className="text-base font-semibold"><Signo n={aporteDirecto} /></div>
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
          (te ahorrás ₡{money(r.costosAhorrados)} y perdés ₡{money(r.ingresosPerdidos)} de ingresos).</>
        ) : (
          <>En este escenario, cerrar <b>{nombreCierra}</b> <b>empeoraría</b> tu caja en <b>₡{money(-r.efecto)}</b> al mes
          (perdés ₡{money(r.ingresosPerdidos)} de ingresos y solo te ahorrás ₡{money(r.costosAhorrados)}).</>
        )}
      </div>

      {/* Explicación del default */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        De <b>Taller</b> y <b>General</b> se va, por defecto, la <b>parte de {nombreCierra}</b> (su % del prorrateo del
        mes): la harina y la producción que eran para esa panadería <b>sí desaparecen</b>. El resto se queda porque el
        Taller sigue produciendo para las otras. Si creés que se va más (o menos), movelo con el %. Los
        <b> préstamos</b> (Sin negocio) no se van; el <b>IVA</b> sí bajaría al vender menos — podés ponerle un % a ojo.
      </div>

      {/* Centros */}
      <div className="space-y-2">
        {centrosOrden.map((c) => {
          const cod = c.centro_codigo;
          const rol = rolCentro(cod);
          const esCierra = cod === cierra;
          const f = (pct[cod] ?? 0) / 100;
          const seVaMonto = c.neto * f; // con signo
          const op = !!abierto[cod];
          const sharePct = Math.round((reparto[cod]?.[cierra] ?? 0) * 1000) / 10;
          return (
            <div key={cod} className={`overflow-hidden rounded-lg border ${esCierra ? "border-neutral-900" : "border-neutral-200"} bg-white`}>
              <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${esCierra ? "bg-neutral-900 text-white" : "bg-neutral-50 text-neutral-800"}`}>
                <button onClick={() => setAbierto((s) => ({ ...s, [cod]: !s[cod] }))} className="text-left text-sm font-semibold">
                  <span className="mr-1 text-xs">{op ? "▾" : "▸"}</span>
                  {c.centro_nombre}
                  {esCierra && <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px]">cierra</span>}
                  {rol === "apoyo" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">apoyo</span>}
                  <span className={`ml-2 text-xs font-normal ${esCierra ? "text-neutral-300" : "text-neutral-500"}`}>
                    neto <Signo n={c.neto} />
                  </span>
                </button>
                <div className="flex items-center gap-2 text-xs">
                  {esCierra ? (
                    <span className="rounded bg-white/20 px-2 py-0.5">cierra entera — 100% se va</span>
                  ) : (
                    <>
                      <span className={esCierra ? "text-neutral-300" : "text-neutral-500"}>se va</span>
                      <input
                        type="number" min={0} max={100} value={pct[cod] ?? 0}
                        onChange={(e) => setP(cod, Number(e.target.value))}
                        className="w-16 rounded border border-neutral-300 px-1.5 py-0.5 text-right tabular-nums"
                      />
                      <span className="text-neutral-500">%</span>
                      <span className="w-28 text-right font-medium"><Signo n={-seVaMonto} /></span>
                    </>
                  )}
                </div>
              </div>

              {/* Presets para centros de apoyo */}
              {!esCierra && rol === "apoyo" && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 bg-neutral-50/50 px-4 py-1.5 text-xs">
                  <span className="text-neutral-500">Rápido:</span>
                  <button onClick={() => setP(cod, sharePct)} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">
                    Parte de {nombreCierra} ({sharePct}%)
                  </button>
                  <button onClick={() => setP(cod, 50)} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Mitad</button>
                  <button onClick={() => setP(cod, 100)} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Todo</button>
                  <button onClick={() => setP(cod, 0)} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Nada</button>
                </div>
              )}

              {/* Detalle de líneas (solo lectura) */}
              {op && (
                <table className="w-full border-t border-neutral-100 text-sm">
                  <tbody className="divide-y divide-neutral-100">
                    {[...c.entradas.map((x) => ({ ...x, s: 1 })), ...c.salidas.map((x) => ({ ...x, s: -1 }))].flatMap((cat) =>
                      cat.lineas.map((l) => (
                        <tr key={`${cat.categoria}-${cat.s}-${l.cuenta_codigo}`}>
                          <td className="py-1 pl-8 pr-3 text-neutral-600">
                            {l.cuenta_nombre}<span className="ml-2 text-[11px] text-neutral-400">{cat.categoria}</span>
                          </td>
                          <td className="px-4 py-1 text-right"><Signo n={cat.s * l.monto} /></td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* Reconciliación */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
        <b>Todo cuadra:</b> flujo actual <Signo n={flujoActual} /> + efecto de cerrar{" "}
        <span className={r.efecto >= 0 ? "text-green-700" : "text-red-600"}>{r.efecto >= 0 ? "+" : "−"}{money(Math.abs(r.efecto))}</span>{" "}
        = flujo proyectado <Signo n={r.flujoProyectado} />. Cada centro muestra cuánto se va; lo demás se queda. Abrí
        cada uno (▸) para ver el detalle línea por línea.
      </div>

      {/* ¿Me alcanza para pagar lo pendiente? (elegir qué meter) */}
      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-300 bg-white">
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
            <div className="text-xs text-neutral-500">Me queda</div>
            <div className={`text-lg font-semibold tabular-nums ${meQueda < 0 ? "text-red-700" : "text-green-800"}`}>
              {meQueda < 0 ? `(${money(-meQueda)})` : money(meQueda)}
            </div>
          </div>
        </div>

        {/* Presets de selección */}
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 bg-neutral-50/50 px-4 py-2 text-xs">
          <span className="text-neutral-500">Meter en el flujo:</span>
          <button onClick={() => setPreset("venc")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Solo lo vencido</button>
          <button onClick={() => setPreset("todo")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Todo</button>
          <button onClick={() => setPreset("nada")} className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100">Nada</button>
          <span className="ml-auto text-neutral-500">
            Marcado <b className="tabular-nums text-neutral-700">{money(seleccionado)}</b> de {money(totalPendiente)}
            {" "}· vencido total {money(totalVencido)}
          </span>
        </div>

        {/* Pendiente por panadería, con checkbox por categoría (vencido / por vencer) */}
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
                        debe {money(p.pendiente)} · vencido {money(p.vencido)}
                        {p.porVencer > 0 && <> · por vencer {money(p.porVencer)}</>}
                      </span>
                    </td>
                  </tr>
                  {p.categorias.flatMap((cat) => {
                    const filas: { id: string; etiqueta: string; venc: boolean; monto: number }[] = [];
                    if (cat.vencido > 0) filas.push({ id: `${p.centro_codigo}|${cat.categoria}|venc`, etiqueta: cat.categoria, venc: true, monto: cat.vencido });
                    if (cat.porVencer > 0) filas.push({ id: `${p.centro_codigo}|${cat.categoria}|porv`, etiqueta: cat.categoria, venc: false, monto: cat.porVencer });
                    return filas.map((f) => {
                      const on = !!incluido[f.id];
                      return (
                        <tr key={f.id} className={on ? "" : "opacity-50"}>
                          <td className="py-1 pl-8 pr-3">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input type="checkbox" checked={on} onChange={() => toggleItem(f.id)} className="h-4 w-4 accent-neutral-900" />
                              <span className="text-neutral-700">{f.etiqueta}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${f.venc ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {f.venc ? "vencido" : "por vencer"}
                              </span>
                            </label>
                          </td>
                          <td className="px-4 py-1 text-right tabular-nums text-neutral-600">{money(f.monto)}</td>
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
            Es lo <b>devengado y aún no pagado</b> (lo que el flujo —base caja— no muestra). Marcá lo que querés pagar:
            por defecto solo lo <b className="text-red-700">vencido</b> (ya tocaba); lo <b className="text-amber-700">por
            vencer</b> aún no tenés que pagarlo este mes, por eso viene desmarcado.
            {meQueda < 0 && <b className="text-red-700"> Con lo marcado no alcanza: faltan ₡{money(-meQueda)}.</b>}
          </p>
          {mesesRecuperar !== null && (
            <p>
              Si cerrás <b>{nombreCierra}</b>, la caja mejora <b>₡{money(r.efecto)}/mes</b>, así que cubrir ese
              faltante tomaría <b>~{mesesRecuperar} mes{mesesRecuperar === 1 ? "" : "es"}</b>. Lo ya recibido se sigue
              debiendo; lo que se deja de acumular es a futuro.
            </p>
          )}
          <p className="text-neutral-400">
            Nota: los <b>préstamos</b> bancarios (largo plazo, en cuotas) no se cuentan acá. Esto es la deuda operativa
            de corto plazo.
          </p>
        </div>
      </div>
    </div>
  );
}
