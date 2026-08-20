"use client";

import { useActionState } from "react";
import { generarProrrateo, type FormState } from "@/app/(app)/admin/actions";

const inicial: FormState = {};

export default function GenerarProrrateoBtn({
  periodoId,
  origenId,
  disabled,
  title,
}: {
  periodoId: string;
  origenId: string;
  disabled?: boolean;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(generarProrrateo, inicial);

  return (
    <form action={formAction}>
      <input type="hidden" name="periodo" value={periodoId} />
      <input type="hidden" name="origen" value={origenId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        title={title}
      >
        {pending ? "Generando…" : "Generar / rehacer prorrateo"}
      </button>
      {state.error && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
