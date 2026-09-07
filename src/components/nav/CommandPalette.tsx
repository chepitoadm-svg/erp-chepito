"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { navTargets, type NavTarget } from "@/lib/nav";
import NavIcon from "./NavIcon";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Fuente de resultados. Hoy solo "módulos"; la arquitectura queda lista para
// sumar después fuentes de datos (facturas, proveedores, asientos) como otras
// secciones, sin cambiar el componente.
type Resultado = NavTarget;

export default function CommandPalette() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [mac, setMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMac(/mac/i.test(navigator.platform));
  }, []);

  // Atajo global Ctrl/Cmd + K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setAbierto((v) => !v);
      } else if (e.key === "Escape") {
        setAbierto(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (abierto) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [abierto]);

  const resultados: Resultado[] = useMemo(() => {
    const todos = navTargets();
    const nq = norm(q.trim());
    if (!nq) return todos;
    return todos.filter((t) => norm(`${t.label} ${t.desc} ${t.grupo}`).includes(nq));
  }, [q]);

  const ir = (t?: Resultado) => {
    if (!t) return;
    setAbierto(false);
    router.push(t.href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(resultados[idx]);
    }
  };

  return (
    <>
      {/* Disparador en la barra, a la par del logo */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="hidden rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 sm:inline">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/20 p-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAbierto(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setIdx(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Buscar módulos y acciones…"
                className="w-full bg-transparent py-3 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-1.5">
              {resultados.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-neutral-400">Nada que coincida.</div>
              ) : (
                <>
                  <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Módulos</div>
                  {resultados.map((t, i) => (
                    <button
                      key={t.href}
                      type="button"
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => ir(t)}
                      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left ${
                        i === idx ? "bg-neutral-100" : "hover:bg-neutral-50"
                      }`}
                    >
                      <span className={i === idx ? "text-neutral-900" : "text-neutral-500"}>
                        <NavIcon name={t.icon} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-neutral-900">
                          {t.label}
                          <span className="ml-2 text-xs text-neutral-400">{t.grupo}</span>
                        </span>
                        {t.desc && <span className="block truncate text-xs text-neutral-500">{t.desc}</span>}
                      </span>
                      {i === idx && <span className="text-[11px] text-neutral-400">Enter ↵</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
