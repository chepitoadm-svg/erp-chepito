"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  analizarDesecho,
  guardarDesecho,
  ligarCosto,
  postearReclasificacion,
  type DesechoState,
  type LineaDesecho,
} from "@/app/(app)/costos/desecho/actions";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
const inicial: DesechoState = {};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return m ? `${MESES[m - 1]} ${y}` : p;
};

type Clase = "merma" | "auto";

export default function DesechoTablero() {
  const [analisis, analizarAction, analizando] = useActionState(analizarDesecho, inicial);
  const [clasif, setClasif] = useState<Map<string, Clase>>(new Map());
  const [manual, setManual] = useState<Map<string, { costo: number; nombre: string }>>(new Map());
  const [posteando, startPost] = useTransition();
  const [postMsg, setPostMsg] = useState<{ ok?: string; error?: string }>({});
  const [guardando, startGuardar] = useTransition();
  const [guardarMsg, setGuardarMsg] = useState<{ ok?: string; error?: string }>({});

  const setClase = (tipo: string, clase: Clase | null) =>
    setClasif((prev) => {
      const m = new Map(prev);
      if (clase === null) m.delete(tipo);
      else m.set(tipo, clase);
      return m;
    });

  const costoDe = (codigo: string): number | null => {
    const m = manual.get(codigo);
    if (m) return m.costo;
    return analisis.productos?.[codigo]?.costo ?? null;
  };

  const calc = useMemo(() => {
    if (!analisis.items) return null;
    // Suma cantidad por (código, clase) según la clasificación de tipos.
    const qty = { merma: new Map<string, number>(), auto: new Map<string, number>() };
    for (const it of analisis.items) {
      const clase = clasif.get(it.tipo);
      if (!clase) continue;
      const map = qty[clase];
      map.set(it.codigo, (map.get(it.codigo) ?? 0) + it.cantidad);
    }
    const bucket = (map: Map<string, number>) => {
      let total = 0;
      const sin: { codigo: string; nombre: string; cantidad: number }[] = [];
      for (const [codigo, cantidad] of map) {
        if (cantidad === 0) continue;
        const c = costoDe(codigo);
        const nombre = analisis.productos?.[codigo]?.nombre ?? codigo;
        if (c != null) total += cantidad * c;
        else sin.push({ codigo, nombre, cantidad });
      }
      return { total: Math.round(total * 100) / 100, sin };
    };
    const merma = bucket(qty.merma);
    const auto = bucket(qty.auto);
    // "Sin receta" combinado (de todo lo clasificado).
    const sinMap = new Map<string, { codigo: string; nombre: string; cantidad: number }>();
    [...merma.sin, ...auto.sin].forEach((p) => {
      const e = sinMap.get(p.codigo) ?? { codigo: p.codigo, nombre: p.nombre, cantidad: 0 };
      e.cantidad += p.cantidad;
      sinMap.set(p.codigo, e);
    });
    const sinCosto = [...sinMap.values()].sort((a, b) => b.cantidad - a.cantidad);
    const compras = analisis.compras_total ?? 0;
    const vendido = Math.round((compras - merma.total - auto.total) * 100) / 100;
    return { mermaTotal: merma.total, autoTotal: auto.total, sinCosto, compras, vendido };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis, clasif, manual]);

  const hayClasificado = clasif.size > 0;

  // Snapshot de TODOS los artículos del Excel (con su clase y costo) para guardar.
  const construirLineas = (): LineaDesecho[] =>
    (analisis.items ?? []).map((it) => {
      const cl = clasif.get(it.tipo);
      const clase: LineaDesecho["clase"] = cl === "merma" ? "merma" : cl === "auto" ? "autoconsumo" : "ignorar";
      const cu = costoDe(it.codigo);
      const nombre = analisis.productos?.[it.codigo]?.nombre ?? it.codigo;
      return {
        codigo: it.codigo,
        nombre,
        tipo_mov: it.tipo,
        clase,
        cantidad: it.cantidad,
        costo_unitario: cu,
        costo_total: cu != null ? Math.round(it.cantidad * cu * 100) / 100 : null,
      };
    });

  const puedeGuardar = !!(analisis.centro_costo_id && analisis.periodo && calc);
  const guardarSnapshot = () =>
    startGuardar(async () => {
      if (!analisis.centro_costo_id || !analisis.periodo || !calc) return;
      const r = await guardarDesecho(
        analisis.centro_costo_id,
        analisis.periodo,
        analisis.bodega ?? "",
        calc.compras,
        calc.mermaTotal,
        calc.autoTotal,
        calc.vendido,
        construirLineas(),
      );
      setGuardarMsg(r);
    });

  return (
    <div className="space-y-6">
      <form action={analizarAction} className="max-w-xl rounded-lg border border-neutral-200 bg-white p-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Excel de movimientos (QuPOS)</span>
          <input
            type="file"
            name="archivo"
            required
            accept=".xlsx"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
          />
        </label>
        {analisis.error && <p className="mt-2 text-sm text-red-600">{analisis.error}</p>}
        <button
          type="submit"
          disabled={analizando}
          className="mt-3 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {analizando ? "Leyendo…" : "Analizar movimientos"}
        </button>
      </form>

      {analisis.tipos && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-neutral-900">
              {analisis.bodega || "Movimientos"}
              {analisis.periodo ? ` — ${etiquetaMes(analisis.periodo)}` : ""}
            </span>
            <span className="text-neutral-500">
              Costos: <b>{analisis.recetasOk ?? 0}</b> recetas leídas
            </span>
            {analisis.costoError && <span className="text-amber-700">⚠️ {analisis.costoError}</span>}
          </div>

          {/* Clasificar cada tipo */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="mb-2 text-sm font-medium text-neutral-800">
              Clasificá cada tipo de movimiento (los que no toques quedan ignorados):
            </p>
            <div className="space-y-1.5">
              {analisis.tipos.map((t) => {
                const cl = clasif.get(t.tipo);
                return (
                  <div key={t.tipo} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-1.5">
                    <span className="text-sm text-neutral-700">
                      {t.tipo} <span className="text-neutral-400">({fmtQty(t.cantidad)} u)</span>
                    </span>
                    <span className="flex gap-1">
                      {(["merma", "auto"] as Clase[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setClase(t.tipo, cl === c ? null : c)}
                          className={`rounded px-2 py-0.5 text-xs ${
                            cl === c
                              ? c === "merma"
                                ? "bg-red-600 text-white"
                                : "bg-amber-500 text-white"
                              : "border border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                          }`}
                        >
                          {c === "merma" ? "Merma" : "Autoconsumo"}
                        </button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {calc && hayClasificado && (
            <>
              {/* Resumen del costo del mes */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3">
                  <div className="text-xs text-neutral-500">Costo del mes (neto)</div>
                  <div className="text-lg font-semibold tabular-nums text-neutral-900">₡{fmt(calc.compras)}</div>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="text-xs text-neutral-500">Costo de lo vendido</div>
                  <div className="text-lg font-semibold tabular-nums text-neutral-800">₡{fmt(calc.vendido)}</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="text-xs text-red-700">💀 Merma (desecho)</div>
                  <div className="text-lg font-semibold tabular-nums text-red-800">₡{fmt(calc.mermaTotal)}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs text-amber-700">🏠 Autoconsumo</div>
                  <div className="text-lg font-semibold tabular-nums text-amber-800">₡{fmt(calc.autoTotal)}</div>
                </div>
              </div>

              {/* Guardar snapshot (sin postear a la conta) */}
              {puedeGuardar && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={guardarSnapshot}
                    className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {guardando ? "Guardando…" : "💾 Guardar snapshot del mes"}
                  </button>
                  {guardarMsg.ok && <span className="text-sm text-green-700">{guardarMsg.ok}</span>}
                  {guardarMsg.error && <span className="text-sm text-red-600">{guardarMsg.error}</span>}
                  <span className="text-xs text-neutral-400">
                    Deja registrado el mes con todos los artículos, aunque no lo postees a contabilidad.
                  </span>
                </div>
              )}

              {analisis.compras_total == null && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No pude leer las compras del mes para esta panadería (¿prorrataste el mes?). Podés ver merma y
                  autoconsumo, pero para postear se necesita el total comprado.
                </p>
              )}

              {/* Postear */}
              {analisis.centro_costo_id && analisis.periodo && (analisis.compras_total ?? 0) > 0 && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="mb-2 text-sm text-neutral-600">
                    Al postear, reclasifico las compras de <b>{analisis.centro_codigo}</b> de{" "}
                    <b>{etiquetaMes(analisis.periodo)}</b>: <b>₡{fmt(calc.vendido)}</b> a costo de lo vendido,{" "}
                    <b>₡{fmt(calc.mermaTotal)}</b> a merma, <b>₡{fmt(calc.autoTotal)}</b> a autoconsumo.
                  </p>
                  {postMsg.ok && <p className="mb-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{postMsg.ok}</p>}
                  {postMsg.error && <p className="mb-2 text-sm text-red-600">{postMsg.error}</p>}
                  {!postMsg.ok && (
                    <button
                      type="button"
                      disabled={posteando}
                      onClick={() =>
                        startPost(async () => {
                          const r = await postearReclasificacion(
                            analisis.centro_costo_id!,
                            analisis.periodo!,
                            calc.mermaTotal,
                            calc.autoTotal,
                          );
                          setPostMsg(r);
                          // Al postear, dejo también el snapshot con todos los artículos.
                          if (r.ok) {
                            const g = await guardarDesecho(
                              analisis.centro_costo_id!,
                              analisis.periodo!,
                              analisis.bodega ?? "",
                              calc.compras,
                              calc.mermaTotal,
                              calc.autoTotal,
                              calc.vendido,
                              construirLineas(),
                            );
                            setGuardarMsg(g);
                          }
                        })
                      }
                      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                    >
                      {posteando ? "Posteando…" : "Postear a contabilidad"}
                    </button>
                  )}
                  {calc.sinCosto.length > 0 && !postMsg.ok && (
                    <p className="mt-2 text-xs text-amber-700">
                      Ojo: {calc.sinCosto.length} productos sin receta no suman todavía. Ligalos abajo antes de postear
                      para que el monto sea completo.
                    </p>
                  )}
                </div>
              )}

              {/* Sin receta — ligar a mano */}
              {calc.sinCosto.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
                  <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
                    <span>Sin receta (no suman al costo)</span>
                    <span>{calc.sinCosto.length} productos</span>
                  </div>
                  <p className="px-4 py-2 text-xs text-amber-800/80">
                    Si la receta ya existe pero el nombre no calzó, ligala acá — el costo entra al toque y queda guardado.
                  </p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-amber-100">
                      {calc.sinCosto.map((p) => (
                        <tr key={p.codigo}>
                          <td className="px-4 py-1.5 font-mono text-amber-700/80">{p.codigo}</td>
                          <td className="px-4 py-1.5 text-neutral-700">{p.nombre}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-neutral-500">{fmtQty(p.cantidad)} u</td>
                          <td className="px-4 py-1.5 text-right">
                            <LigarReceta
                              codigo={p.codigo}
                              recetas={analisis.recetas ?? []}
                              onLigado={(costo, nombre) => setManual((prev) => new Map(prev).set(p.codigo, { costo, nombre }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LigarReceta({
  codigo,
  recetas,
  onLigado,
}: {
  codigo: string;
  recetas: { id: string; nombre: string; costo: number }[];
  onLigado: (costo: number, nombre: string) => void;
}) {
  const [sel, setSel] = useState("");
  const [guardando, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="max-w-[200px] rounded border border-amber-300 bg-white px-1.5 py-1 text-xs outline-none"
      >
        <option value="">Ligar receta…</option>
        {recetas.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre} — ₡{fmt(r.costo)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!sel || guardando}
        onClick={() => {
          const r = recetas.find((x) => x.id === sel);
          if (!r) return;
          onLigado(r.costo, r.nombre);
          start(() => {
            void ligarCosto(codigo, r.id, r.nombre, r.costo);
          });
        }}
        className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
      >
        {guardando ? "…" : "Ligar"}
      </button>
    </span>
  );
}
