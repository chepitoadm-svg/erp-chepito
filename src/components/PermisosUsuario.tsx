"use client";

import { useMemo, useState, useTransition } from "react";
import { guardarPermisosUsuario } from "@/app/(app)/usuarios/actions";
import type { PermisoOpt } from "@/components/PermisosSelector";

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

type Efecto = "perfil" | "conceder" | "revocar";

/**
 * Ajustes puntuales de permisos de UN usuario, por encima de su perfil.
 * Cada permiso: "Según perfil" (sin override), "Permitir" o "Bloquear".
 */
export default function PermisosUsuario({
  usuarioId,
  permisos,
  basePerfil,
  conceder,
  revocar,
  esAdmin,
}: {
  usuarioId: string;
  permisos: PermisoOpt[];
  basePerfil: string[]; // ids de permisos que da el perfil
  conceder: string[];
  revocar: string[];
  esAdmin: boolean;
}) {
  const base = useMemo(() => new Set(basePerfil), [basePerfil]);
  const [estado, setEstado] = useState<Record<string, Efecto>>(() => {
    const m: Record<string, Efecto> = {};
    for (const id of conceder) m[id] = "conceder";
    for (const id of revocar) m[id] = "revocar";
    return m;
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const grupos = useMemo(() => {
    const m = new Map<string, PermisoOpt[]>();
    for (const p of permisos) (m.get(p.modulo) ?? m.set(p.modulo, []).get(p.modulo)!).push(p);
    return [...m.entries()].sort((a, b) => label(a[0]).localeCompare(label(b[0])));
  }, [permisos]);

  const set = (id: string, ef: Efecto) =>
    setEstado((s) => {
      const n = { ...s };
      if (ef === "perfil") delete n[id];
      else n[id] = ef;
      return n;
    });

  const nOverrides = Object.keys(estado).length;

  const guardar = () =>
    start(async () => {
      const conc = Object.entries(estado).filter(([, e]) => e === "conceder").map(([id]) => id);
      const rev = Object.entries(estado).filter(([, e]) => e === "revocar").map(([id]) => id);
      const r = await guardarPermisosUsuario(usuarioId, conc, rev);
      setMsg(r);
    });

  if (esAdmin) {
    return (
      <div className="rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-800">Permisos puntuales</h2>
        <p className="mt-1 text-sm text-amber-800">
          Este usuario es <strong>Administrador</strong>: tiene acceso a todo, no aplican ajustes.
        </p>
      </div>
    );
  }

  const btn = (id: string, ef: Efecto, txt: string, activeCls: string) => {
    const actual = estado[id] ?? "perfil";
    const on = actual === ef;
    return (
      <button
        type="button"
        onClick={() => set(id, ef)}
        className={`rounded px-2 py-0.5 text-xs ${on ? activeCls : "text-neutral-500 hover:bg-neutral-100"}`}
      >
        {txt}
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-800">Permisos puntuales</h2>
        {nOverrides > 0 && <span className="text-xs text-neutral-400">{nOverrides} ajuste(s)</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Por defecto el usuario hereda lo que da su perfil. Acá podés <strong>permitir</strong> o{" "}
        <strong>bloquear</strong> algo puntual solo para este usuario.
      </p>

      <div className="mt-3 space-y-3">
        {grupos.map(([modulo, items]) => (
          <details key={modulo} className="rounded-lg border border-neutral-200">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-neutral-800">
              {label(modulo)}
            </summary>
            <div className="divide-y divide-neutral-100 border-t border-neutral-100">
              {items.map((p) => {
                const daPerfil = base.has(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-sm text-neutral-700">
                      {p.descripcion ?? p.codigo}
                      <span className="ml-2 text-xs text-neutral-400">
                        {daPerfil ? "(perfil: permite)" : "(perfil: no da)"}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 p-0.5">
                      {btn(p.id, "perfil", "Según perfil", "bg-neutral-800 text-white")}
                      {btn(p.id, "conceder", "Permitir", "bg-green-600 text-white")}
                      {btn(p.id, "revocar", "Bloquear", "bg-red-600 text-white")}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar permisos puntuales"}
        </button>
        {msg.error && <span className="text-sm text-red-600">{msg.error}</span>}
        {msg.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
      </div>
    </div>
  );
}
