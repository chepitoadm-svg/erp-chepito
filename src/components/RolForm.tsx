"use client";

import Link from "next/link";
import { useActionState } from "react";
import PermisosSelector, { type PermisoOpt } from "@/components/PermisosSelector";
import type { RolFormState } from "@/app/(app)/roles/actions";

const inicialState: RolFormState = {};

export default function RolForm({
  modo,
  action,
  permisos,
  inicial,
  esAdmin = false,
}: {
  modo: "crear" | "editar";
  action: (prev: RolFormState, formData: FormData) => Promise<RolFormState>;
  permisos: PermisoOpt[];
  inicial?: { id?: string; nombre?: string; descripcion?: string | null; permisos?: string[] };
  esAdmin?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, inicialState);

  return (
    <form action={formAction} className="space-y-5">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Nombre del perfil</label>
          <input
            name="nombre"
            type="text"
            required
            minLength={2}
            defaultValue={inicial?.nombre ?? ""}
            placeholder="Ej: Contador externo"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Descripción (opcional)</label>
          <input
            name="descripcion"
            type="text"
            defaultValue={inicial?.descripcion ?? ""}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-700">Permisos</h2>
        {esAdmin ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            El perfil <strong>Administrador</strong> siempre tiene acceso a todo; sus permisos no se
            editan.
          </p>
        ) : (
          <>
            <p className="mb-3 mt-1 text-xs text-neutral-500">
              Marcá lo que este perfil puede hacer. Aplica a todos los usuarios que tengan este perfil.
            </p>
            <PermisosSelector permisos={permisos} inicial={inicial?.permisos ?? []} />
          </>
        )}
      </div>

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
          {pending ? "Guardando…" : modo === "crear" ? "Crear perfil" : "Guardar cambios"}
        </button>
        <Link href="/roles" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
