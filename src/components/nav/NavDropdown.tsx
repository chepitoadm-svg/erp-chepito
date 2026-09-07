"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavEntry } from "@/lib/nav";
import NavIcon from "./NavIcon";

const esActiva = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export default function NavDropdown({ entry }: { entry: NavEntry }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cerrarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grupoActivo = (entry.items ?? []).some((i) => esActiva(pathname, i.href));

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const abrir = () => {
    if (cerrarTimer.current) clearTimeout(cerrarTimer.current);
    setAbierto(true);
  };
  const programarCierre = () => {
    cerrarTimer.current = setTimeout(() => setAbierto(false), 120);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={abrir} onMouseLeave={programarCierre}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors ${
          grupoActivo ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
        }`}
        aria-expanded={abierto}
      >
        {entry.label}
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg">
          {(entry.items ?? []).map((it) => {
            const activo = esActiva(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setAbierto(false)}
                className={`flex items-start gap-3 rounded-md px-2.5 py-2 ${
                  activo ? "bg-neutral-100" : "hover:bg-neutral-50"
                }`}
              >
                <span className={`mt-0.5 ${activo ? "text-neutral-900" : "text-neutral-500"}`}>
                  <NavIcon name={it.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">{it.label}</span>
                  {it.desc && <span className="block text-xs text-neutral-500">{it.desc}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
