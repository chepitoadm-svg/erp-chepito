"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  analizarPlanilla,
  guardarPlanilla,
  type PlanillaAnalisis,
  type LineaPlanilla,
} from "@/app/(app)/planilla/actions";
import type { Destino } from "@/lib/data/planilla";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inicial: PlanillaAnalisis = {};

const DESTINOS: { v: Destino; l: string }[] = [
  { v: "TAL", l: "Taller" },
  { v: "CH1", l: "Chepito 1" },
  { v: "CH2", l: "Chepito 2" },
  { v: "DIV", l: "Dividir 1 y 2" },
  { v: "CAS", l: "Casa" },
];

export interface EdicionPlanilla {
  id: string;
  titulo: string;
  fecha: string;
  quincena: number | null;
  reparto_ch1: number;
  lineas: LineaPlanilla[];
}

export default function PlanillaImportar({ edicion }: { edicion?: EdicionPlanilla }) {
  const router = useRouter();
  const [analisis, analizarAction, analizando] = useActionState(analizarPlanilla, inicial);
  const [lineas, setLineas] = useState<LineaPlanilla[] | null>(edicion ? edicion.lineas.map((l) => ({ ...l })) : null);
  const [titulo, setTitulo] = useState(edicion?.titulo ?? "");
  const [fecha, setFecha] = useState(edicion?.fecha ?? "");
  const [quincena, setQuincena] = useState<number | "">(edicion?.quincena ?? "");
  const [reparto, setReparto] = useState(edicion?.reparto_ch1 ?? 50);
  const [guardando, startGuardar] = useTransition();
  const [msg, setMsg] = useState<{ error?: string }>({});

  // Al llegar un análisis nuevo, cargo el estado editable una sola vez.
  const [cargadoDe, setCargadoDe] = useState<LineaPlanilla[] | null>(null);
  if (analisis.lineas && analisis.lineas !== cargadoDe) {
    setCargadoDe(analisis.lineas);
    setLineas(analisis.lineas.map((l) => ({ ...l })));
    setTitulo(analisis.titulo ?? "");
    setFecha(analisis.fecha ?? "");
    setQuincena(analisis.quincena ?? "");
  }

  const setDestino = (i: number, d: Destino) =>
    setLineas((prev) => (prev ? prev.map((l, j) => (j === i ? { ...l, destino: d } : l)) : prev));
  const setNum = (i: number, campo: "rebajos" | "embargo", v: number) =>
    setLineas((prev) => (prev ? prev.map((l, j) => (j === i ? { ...l, [campo]: Number.isFinite(v) ? v : 0 } : l)) : prev));

  const calc = useMemo(() => {
    if (!lineas) return null;
    let ded = 0, carg = 0, nod = 0, ret = 0, apo = 0, adel = 0, emb = 0, neto = 0;
    for (const l of lineas) {
      // El embargo es parte de los rebajos: el salario devengado = base − (rebajos − embargo).
      const baseEf = l.salario_base - l.rebajos + l.embargo;
      if (l.tiene_ccss) {
        ded += baseEf;
        carg += l.cargas_patronal;
      } else nod += baseEf;
      nod += l.pago_adicional;
      ret += l.ccss_obrero;
      apo += l.cargas_patronal;
      adel += l.adelanto;
      emb += l.embargo;
      neto += l.salario_base - l.rebajos + l.pago_adicional - l.ccss_obrero - l.adelanto;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const debe = r2(ded + carg + nod);
    const haber = r2(ret + apo + emb + adel + neto);
    return { ded: r2(ded), carg: r2(carg), nod: r2(nod), ret: r2(ret), apo: r2(apo), adel: r2(adel), emb: r2(emb), neto: r2(neto), debe, haber };
  }, [lineas]);

  const guardar = () =>
    startGuardar(async () => {
      if (!lineas) return;
      const r = await guardarPlanilla({
        id: edicion?.id ?? null,
        titulo,
        fecha,
        quincena: quincena === "" ? null : Number(quincena),
        reparto_ch1: reparto,
        lineas,
      });
      if (r.error) setMsg({ error: r.error });
      else if (r.id) router.push(`/planilla/${r.id}`);
    });

  return (
    <div className="space-y-5">
      {!edicion && (
      <form action={analizarAction} className="max-w-xl rounded-lg border border-neutral-200 bg-white p-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">CSV de la app de planilla</span>
          <input
            type="file"
            name="archivo"
            required
            accept=".csv,text/csv"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
          />
        </label>
        {analisis.error && <p className="mt-2 text-sm text-red-600">{analisis.error}</p>}
        <button
          type="submit"
          disabled={analizando}
          className="mt-3 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {analizando ? "Leyendo…" : "Importar planilla"}
        </button>
      </form>
      )}

      {lineas && (
        <div className="space-y-4">
          {/* Cabecera */}
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Título
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="min-w-[220px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Fecha contable
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Quincena
              <select value={quincena} onChange={(e) => setQuincena(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none">
                <option value="">—</option>
                <option value={1}>1ra</option>
                <option value={2}>2da</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Reparto “Dividir” a CH1 (%)
              <input type="number" min={0} max={100} value={reparto} onChange={(e) => setReparto(Number(e.target.value))} className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none" />
            </label>
            <span className="text-xs text-neutral-400">El resto ({100 - reparto}%) va a CH2.</span>
          </div>
          <p className="text-xs text-neutral-400">
            <b>Embargo:</b> si parte de los <i>rebajos</i> de alguien es un embargo, ponelo en la columna Embargo — el
            sistema lo saca de los rebajos solo (no restés nada) y lo manda a &ldquo;embargos por pagar&rdquo;. El neto no cambia.
          </p>

          {/* Tabla editable */}
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">CCSS</th>
                  <th className="px-3 py-2 font-medium">Destino</th>
                  <th className="px-3 py-2 text-right font-medium">Base</th>
                  <th className="px-3 py-2 text-right font-medium">Rebajos</th>
                  <th className="px-3 py-2 text-right font-medium">Embargo</th>
                  <th className="px-3 py-2 text-right font-medium">CCSS obr.</th>
                  <th className="px-3 py-2 text-right font-medium">Cargas pat.</th>
                  <th className="px-3 py-2 text-right font-medium">Adicional</th>
                  <th className="px-3 py-2 text-right font-medium">Adelanto</th>
                  <th className="px-3 py-2 text-right font-medium">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {lineas.map((l, i) => {
                  const neto = l.salario_base - l.rebajos + l.pago_adicional - l.ccss_obrero - l.adelanto;
                  return (
                    <tr key={l.clave + i}>
                      <td className="px-3 py-1.5 text-neutral-800">
                        {l.nombre}
                        {l.puesto ? <span className="block text-xs text-neutral-400">{l.puesto}</span> : null}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${l.tiene_ccss ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {l.tiene_ccss ? "Sí" : "No"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={l.destino}
                          onChange={(e) => setDestino(i, e.target.value as Destino)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none"
                        >
                          {DESTINOS.map((d) => (
                            <option key={d.v} value={d.v}>
                              {d.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{fmt(l.salario_base)}</td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          value={l.rebajos || ""}
                          onChange={(e) => setNum(i, "rebajos", Number(e.target.value))}
                          placeholder="0"
                          className="w-24 rounded border border-neutral-300 px-1.5 py-0.5 text-right text-xs tabular-nums outline-none focus:border-neutral-500"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          value={l.embargo || ""}
                          onChange={(e) => setNum(i, "embargo", Number(e.target.value))}
                          placeholder="0"
                          className="w-24 rounded border border-amber-300 px-1.5 py-0.5 text-right text-xs tabular-nums outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.ccss_obrero ? fmt(l.ccss_obrero) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.cargas_patronal ? fmt(l.cargas_patronal) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.pago_adicional ? fmt(l.pago_adicional) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.adelanto ? fmt(l.adelanto) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-neutral-900">{fmt(neto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Vista previa del asiento */}
          {calc && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Gastos (Debe)</div>
                <Row k="Salarios (con CCSS)" v={calc.ded} />
                <Row k="Salarios no deducibles" v={calc.nod} />
                <Row k="Cargas sociales" v={calc.carg} />
                <Row k="Total Debe" v={calc.debe} bold />
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Pasivos / neto (Haber)</div>
                <Row k="Retención obrera" v={calc.ret} />
                <Row k="Aporte patronal" v={calc.apo} />
                <Row k="Embargos por pagar" v={calc.emb} />
                <Row k="Adelantos descontados" v={calc.adel} />
                <Row k="Salarios por pagar (neto)" v={calc.neto} />
                <Row k="Total Haber" v={calc.haber} bold />
              </div>
            </div>
          )}

          {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
          <button
            type="button"
            disabled={guardando || !fecha}
            onClick={guardar}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Guardar planilla (borrador)"}
          </button>
          {!fecha && <span className="ml-2 text-xs text-amber-700">Poné la fecha contable para guardar.</span>}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "mt-1 border-t border-neutral-200 pt-1 font-semibold text-neutral-900" : "text-neutral-600"}`}>
      <span>{k}</span>
      <span className="tabular-nums">₡{fmt(v)}</span>
    </div>
  );
}
