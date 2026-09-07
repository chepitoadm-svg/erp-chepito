"use client";

import { useState, useTransition } from "react";
import { guardarDato, borrarDato } from "@/app/(app)/panaderias/actions";
import type { PanaderiaDato } from "@/lib/data/panaderias";

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

const SUGERENCIAS = ["NIS agua (AyA)", "NIS luz (CNFL)", "Medidor luz", "Medidor agua", "Contrato alquiler", "Teléfono"];

export default function PanaderiaDatos({
  centros,
  datos,
  puedeEditar,
}: {
  centros: Centro[];
  datos: PanaderiaDato[];
  puedeEditar: boolean;
}) {
  return (
    <div className="space-y-5">
      {centros.map((c) => (
        <CentroCard key={c.id} centro={c} datos={datos.filter((d) => d.centro_costo_id === c.id)} puedeEditar={puedeEditar} />
      ))}
    </div>
  );
}

function CentroCard({ centro, datos, puedeEditar }: { centro: Centro; datos: PanaderiaDato[]; puedeEditar: boolean }) {
  const [etiqueta, setEtiqueta] = useState("");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const agregar = () =>
    start(async () => {
      setMsg("");
      const r = await guardarDato({ id: null, centro: centro.id, etiqueta, valor, nota });
      if (r.error) setMsg(r.error);
      else {
        setEtiqueta("");
        setValor("");
        setNota("");
      }
    });

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
        <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">{centro.codigo}</span>
        <span className="text-sm font-semibold text-neutral-800">{centro.nombre}</span>
        <span className="ml-auto text-xs text-neutral-400">{datos.length} dato{datos.length === 1 ? "" : "s"}</span>
      </div>

      <table className="w-full text-sm">
        <tbody className="divide-y divide-neutral-100">
          {datos.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-3 text-center text-neutral-400">Sin datos todavía.</td>
            </tr>
          )}
          {datos.map((d) => (
            <DatoRow key={d.id} dato={d} puedeEditar={puedeEditar} />
          ))}
        </tbody>
      </table>

      {puedeEditar && (
        <div className="border-t border-neutral-200 bg-neutral-50/60 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEtiqueta(s)}
                className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100"
              >
                + {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              Etiqueta
              <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="NIS agua…" className="w-44 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              Valor
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1234567" className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            </label>
            <label className="flex flex-1 flex-col gap-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              Nota (opcional)
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="medidor de atrás…" className="min-w-[140px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            </label>
            <button
              type="button"
              disabled={pending || !etiqueta.trim()}
              onClick={agregar}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Agregar"}
            </button>
          </div>
          {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function DatoRow({ dato, puedeEditar }: { dato: PanaderiaDato; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [etiqueta, setEtiqueta] = useState(dato.etiqueta);
  const [valor, setValor] = useState(dato.valor ?? "");
  const [nota, setNota] = useState(dato.nota ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const guardar = () =>
    start(async () => {
      setMsg("");
      const r = await guardarDato({ id: dato.id, centro: dato.centro_costo_id, etiqueta, valor, nota });
      if (r.error) setMsg(r.error);
      else setEditando(false);
    });
  const borrar = () =>
    start(async () => {
      const r = await borrarDato(dato.id);
      if (r.error) setMsg(r.error);
    });

  if (editando) {
    return (
      <tr className="bg-blue-50/40">
        <td className="px-4 py-1.5"><input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm outline-none" /></td>
        <td className="px-4 py-1.5"><input value={valor} onChange={(e) => setValor(e.target.value)} className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm outline-none" /></td>
        <td className="px-4 py-1.5"><input value={nota} onChange={(e) => setNota(e.target.value)} className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm outline-none" /></td>
        <td className="px-4 py-1.5 text-right whitespace-nowrap">
          <button type="button" disabled={pending} onClick={guardar} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Guardar</button>
          <button type="button" onClick={() => setEditando(false)} className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800">Cancelar</button>
          {msg && <span className="ml-2 text-xs text-red-600">{msg}</span>}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-neutral-800">{dato.etiqueta}</td>
      <td className="px-4 py-2 font-mono text-neutral-700">{dato.valor ?? "—"}</td>
      <td className="px-4 py-2 text-neutral-500">{dato.nota ?? ""}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {puedeEditar && (
          <>
            <button type="button" onClick={() => setEditando(true)} className="text-xs text-neutral-500 hover:text-neutral-900">editar</button>
            <button type="button" disabled={pending} onClick={borrar} className="ml-3 text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50">borrar</button>
          </>
        )}
        {msg && <span className="ml-2 text-xs text-red-600">{msg}</span>}
      </td>
    </tr>
  );
}
