"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface OpcionBuscable {
  value: string;
  label: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Select con búsqueda por texto. Si se le pasa `name`, envía el valor por un
// input oculto (funciona igual que un <select> en un <form>). Soporta modo
// controlado (value + onChange) o no controlado (defaultValue). El desplegable
// va en un portal con posición fija para no recortarse dentro de tablas.
export default function SelectBuscable({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Buscar…",
  required,
  disabled,
  className,
}: {
  name?: string;
  options: OpcionBuscable[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue ?? "");
  const sel = controlado ? value! : interno;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const selLabel = options.find((o) => o.value === sel)?.label ?? "";
  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    const base = q ? options.filter((o) => norm(o.label).includes(q)) : options;
    return base.slice(0, 60);
  }, [options, query]);

  const abrir = () => {
    if (disabled) return;
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom, left: r.left, width: r.width });
    setQuery("");
    setOpen(true);
  };

  // Cerrar al hacer scroll/resize (la posición fija quedaría desalineada).
  useEffect(() => {
    if (!open) return;
    const cerrar = () => setOpen(false);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [open]);

  const elegir = (v: string) => {
    if (!controlado) setInterno(v);
    onChange?.(v);
    setQuery("");
    setOpen(false);
  };

  const base =
    className ??
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500";

  return (
    <>
      {name && <input type="hidden" name={name} value={sel} required={required} />}
      <input
        ref={inputRef}
        type="text"
        value={open ? query : selLabel}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={abrir}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) abrir();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={base}
      />
      {open &&
        rect &&
        montado &&
        createPortal(
          <ul
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 60 }}
            className="mt-1 max-h-72 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg"
          >
            {filtradas.length === 0 && (
              <li className="px-3 py-2 text-sm text-neutral-400">Sin resultados</li>
            )}
            {filtradas.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(o.value);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                    o.value === sel ? "bg-neutral-50 font-medium" : ""
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
