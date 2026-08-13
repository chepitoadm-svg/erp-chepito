"use client";

import { useActionState } from "react";
import { lanzarJalado, type FormState } from "@/app/(app)/compras/correo/actions";

const inicial: FormState = {};

export default function JalarAhora() {
  const [state, formAction, pending] = useActionState(lanzarJalado, inicial);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Lanzando…" : "⟳ Jalar ahora"}
      </button>
      {state.ok && <span className="text-sm text-green-700">{state.ok}</span>}
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
