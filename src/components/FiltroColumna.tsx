"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Filtro tipo Excel: botón ▾ (embudo) que abre una lista de valores para marcar
// cuáles mostrar. `seleccion` null = todos. Se posiciona con portal para no
// quedar recortado por contenedores con overflow.
export default function FiltroColumna({
  valores,
  seleccion,
  onAplicar,
}: {
  valores: string[];
  seleccion: Set<string> | null;
  onAplicar: (s: Set<string> | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const distintos = useMemo(
    () => Array.from(new Set(valores.map((v) => v || "(vacío)"))).sort((a, b) => a.localeCompare(b, "es")),
    [valores],
  );
  const activo = seleccion !== null;

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 288)) });
    setDraft(seleccion ? new Set(seleccion) : new Set(distintos));
    setBusca("");
    setAbierto(true);
  };
  useEffect(() => {
    if (!abierto) return;
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setAbierto(false);
    };
    const onResize = () => setAbierto(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [abierto]);

  const visibles = busca.trim() ? distintos.filter((v) => v.toLowerCase().includes(busca.trim().toLowerCase())) : distintos;
  const todosMarcados = visibles.length > 0 && visibles.every((v) => draft.has(v));
  const toggle = (v: string) => {
    const s = new Set(draft);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    setDraft(s);
  };
  const toggleTodos = () => {
    const s = new Set(draft);
    if (todosMarcados) visibles.forEach((v) => s.delete(v));
    else visibles.forEach((v) => s.add(v));
    setDraft(s);
  };
  const aplicar = () => {
    onAplicar(draft.size >= distintos.length ? null : new Set(draft));
    setAbierto(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          abierto ? setAbierto(false) : abrir();
        }}
        className={`rounded p-0.5 leading-none ${activo ? "bg-blue-100 text-blue-700" : "text-neutral-400 hover:text-neutral-700"}`}
        title="Filtrar valores"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M1.5 2.5h13a.5.5 0 0 1 .38.82L10 9.2v4.05a.5.5 0 0 1-.72.45l-2.5-1.25a.5.5 0 0 1-.28-.45V9.2L1.12 3.32a.5.5 0 0 1 .38-.82Z" />
        </svg>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
            <div
              ref={panelRef}
              className="fixed z-50 w-72 rounded-md border border-neutral-300 bg-white text-left normal-case shadow-lg"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="border-b border-neutral-200 p-2">
                <input
                  autoFocus
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar valor…"
                  className="w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-800 outline-none focus:border-neutral-500"
                />
              </div>
              <label className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
                Seleccionar todos {busca.trim() ? "(filtrados)" : ""}
              </label>
              <div className="max-h-64 overflow-y-auto py-1">
                {visibles.length === 0 && <p className="px-2 py-2 text-xs text-neutral-400">Sin coincidencias.</p>}
                {visibles.map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50">
                    <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} />
                    <span className="truncate" title={v}>
                      {v}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-200 p-2">
                <button type="button" onClick={() => setAbierto(false)} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">
                  Cancelar
                </button>
                <button type="button" onClick={aplicar} className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800">
                  Aceptar
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
