"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(app)/usuarios/actions";

interface Opcion {
  id: string;
  nombre: string;
  codigo?: string;
}

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roles: Opcion[];
  sucursales: Opcion[];
  inicial?: {
    id?: string;
    nombre_completo?: string;
    email?: string;
    rol_id?: string | null;
    sucursales?: string[];
  };
}

const estadoInicial: FormState = {};

export default function UsuarioForm({
  modo,
  action,
  roles,
  sucursales,
  inicial,
}: Props) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const sucSeleccionadas = new Set(inicial?.sucursales ?? []);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {modo === "editar" && (
        <input type="hidden" name="id" value={inicial?.id} />
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Nombre completo
        </label>
        <input
          name="nombre_completo"
          type="text"
          required
          minLength={3}
          defaultValue={inicial?.nombre_completo ?? ""}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      {modo === "crear" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Correo
            </label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Contraseña temporal
            </label>
            <input
              name="password"
              type="text"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Mínimo 8 caracteres. El usuario podrá cambiarla luego.
            </p>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Correo
          </label>
          <input
            type="email"
            value={inicial?.email ?? ""}
            disabled
            className="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-700">Rol</label>
        <select
          name="rol_id"
          required
          defaultValue={inicial?.rol_id ?? ""}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          <option value="" disabled>
            Seleccioná un rol…
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-neutral-700">
          Sucursales
        </legend>
        <p className="text-xs text-neutral-500">
          Define qué datos ve y toca el usuario.
        </p>
        <div className="mt-2 space-y-2">
          {sucursales.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="sucursales"
                value={s.id}
                defaultChecked={sucSeleccionadas.has(s.id)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-neutral-700">
                {s.codigo ? `${s.codigo} — ` : ""}
                {s.nombre}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending
            ? "Guardando…"
            : modo === "crear"
              ? "Crear usuario"
              : "Guardar cambios"}
        </button>
        <Link
          href="/usuarios"
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
