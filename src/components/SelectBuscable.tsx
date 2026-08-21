"use client";

import { useMemo, useState } from "react";

export interface OpcionBuscable {
  value: string;
  label: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Select con búsqueda por texto. Envía el valor por un input oculto `name`,
// así funciona igual que un <select> dentro de un <form>. Soporta modo
// controlado (value + onChange) o no controlado (defaultValue).
export default function SelectBuscable({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Buscar…",
  required,
}: {
  name: string;
  options: OpcionBuscable[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue ?? "");
  const sel = controlado ? value! : interno;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selLabel = options.find((o) => o.value === sel)?.label ?? "";
  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    const base = q ? options.filter((o) => norm(o.label).includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);

  const elegir = (v: string) => {
    if (!controlado) setInterno(v);
    onChange?.(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={sel} required={required} />
      <input
        type="text"
        value={open ? query : selLabel}
        placeholder={placeholder}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
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
        </ul>
      )}
    </div>
  );
}
