"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV, type NavItem } from "@/lib/nav";
import { cerrarSesion } from "@/app/(app)/actions";
import NavIcon from "./NavIcon";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esActiva = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

// Aplana NAV a items con su número correlativo (1..N) y el grupo al que pertenecen.
function itemsNumerados(): { grupo: string; num: number; item: NavItem }[] {
  const out: { grupo: string; num: number; item: NavItem }[] = [];
  let n = 0;
  for (const e of NAV) {
    if (e.items) {
      for (const it of e.items) out.push({ grupo: e.label, num: ++n, item: it });
    } else if (e.href) {
      out.push({ grupo: "", num: ++n, item: { label: e.label, href: e.href, desc: "", icon: e.icon ?? "config" } });
    }
  }
  return out;
}

export default function Sidebar({
  nombre,
  rol,
  mostrarRol,
}: {
  nombre: string;
  rol: string;
  mostrarRol: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const buscarRef = useRef<HTMLInputElement>(null);

  const todos = useMemo(() => itemsNumerados(), []);
  const nq = norm(q.trim());
  const visibles = nq ? todos.filter((r) => norm(`${r.item.label} ${r.item.desc} ${r.grupo}`).includes(nq)) : todos;

  // Salto por número (1..9) desde cualquier lado, salvo escribiendo en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const escribiendo =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (escribiendo) return;
      if (e.key >= "1" && e.key <= "9") {
        const r = todos.find((x) => x.num === Number(e.key));
        if (r) {
          e.preventDefault();
          router.push(r.item.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [todos, router]);

  // Agrupar los visibles conservando el orden de grupos de NAV.
  const grupos: { label: string; filas: typeof visibles }[] = [];
  for (const r of visibles) {
    const key = r.grupo || "​"; // grupo vacío = entradas directas
    let g = grupos.find((x) => x.label === key);
    if (!g) grupos.push((g = { label: key, filas: [] }));
    g.filas.push(r);
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-semibold text-neutral-900">ERP Chepito</span>
      </div>

      {/* Buscador */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={buscarRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && visibles[0]) router.push(visibles[0].item.href);
              if (e.key === "Escape") setQ("");
            }}
            placeholder="Buscar módulo…"
            className="w-full bg-transparent py-1.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Módulos */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {grupos.map((g) => (
          <div key={g.label} className="mb-1">
            {g.label !== "​" && (
              <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                {g.label}
              </div>
            )}
            {g.filas.map(({ item, num }) => {
              const activo = esActiva(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                    activo
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-neutral-400">{num}</span>
                  <span className={activo ? "text-neutral-900" : "text-neutral-500"}>
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {visibles.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-neutral-400">Nada que coincida.</div>
        )}
      </nav>

      {/* Usuario + salir */}
      <div className="border-t border-neutral-200 px-3 py-3">
        <div className="mb-2 leading-tight">
          <div className="truncate text-sm font-medium text-neutral-900">{nombre}</div>
          {mostrarRol && <div className="truncate text-xs text-neutral-500">{rol}</div>}
        </div>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Salir
          </button>
        </form>
      </div>
    </aside>
  );
}
