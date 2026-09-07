"use client";

import { useMemo, useState } from "react";

export interface PermisoOpt {
  id: string;
  modulo: string;
  accion: string;
  codigo: string;
  descripcion: string | null;
}

const MODULO_LABEL: Record<string, string> = {
  articulos: "Artículos",
  asientos: "Contabilidad · Asientos",
  auditoria: "Auditoría",
  bodegas: "Bodegas",
  centros: "Centros de costo",
  compras: "Compras",
  costos: "Costos",
  cuentas: "Catálogo de cuentas",
  empresa: "Empresa",
  gastos: "Gastos",
  inventario: "Inventario",
  periodos: "Periodos contables",
  prorrateo: "Prorrateo",
  proveedores: "Proveedores",
  reportes: "Reportes",
  roles: "Perfiles y permisos",
  sucursales: "Sucursales",
  tesoreria: "Tesorería",
  usuarios: "Usuarios",
  ventas: "Ventas",
};

const label = (m: string) => MODULO_LABEL[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

/**
 * Grilla de permisos agrupada por módulo con checkboxes. Emite un input oculto
 * `name` por cada permiso marcado, para enviarse en un <form> normal.
 */
export default function PermisosSelector({
  permisos,
  inicial,
  name = "permisos",
  disabled = false,
}: {
  permisos: PermisoOpt[];
  inicial: string[];
  name?: string;
  disabled?: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(inicial));
  const grupos = useMemo(() => {
    const m = new Map<string, PermisoOpt[]>();
    for (const p of permisos) (m.get(p.modulo) ?? m.set(p.modulo, []).get(p.modulo)!).push(p);
    return [...m.entries()].sort((a, b) => label(a[0]).localeCompare(label(b[0])));
  }, [permisos]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleGrupo = (ids: string[], todos: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const id of ids) (todos ? n.delete(id) : n.add(id));
      return n;
    });

  return (
    <div className="space-y-4">
      {/* inputs que realmente se envían */}
      {[...sel].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {grupos.map(([modulo, items]) => {
        const ids = items.map((i) => i.id);
        const marcados = ids.filter((id) => sel.has(id)).length;
        const todos = marcados === ids.length;
        return (
          <div key={modulo} className="rounded-lg border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2">
              <span className="text-sm font-semibold text-neutral-800">{label(modulo)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleGrupo(ids, todos)}
                  className="text-xs text-neutral-500 hover:text-neutral-900"
                >
                  {todos ? "Quitar todos" : "Marcar todos"}
                  <span className="ml-1 text-neutral-400">
                    ({marcados}/{ids.length})
                  </span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-3 sm:grid-cols-2">
              {items.map((p) => (
                <label key={p.id} className="flex items-start gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={sel.has(p.id)}
                    disabled={disabled}
                    onChange={() => toggle(p.id)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                  />
                  <span className="text-neutral-700">{p.descripcion ?? p.codigo}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
