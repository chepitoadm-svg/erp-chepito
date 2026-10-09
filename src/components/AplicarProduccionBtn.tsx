"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/produccion/actions";

interface Props {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  desde: string;
  hasta: string;
  bodegaId: string;
  disabled?: boolean;
}

export default function AplicarProduccionBtn({ action, desde, hasta, bodegaId, disabled }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="desde" value={desde} />
      <input type="hidden" name="hasta" value={hasta} />
      <input type="hidden" name="bodega_id" value={bodegaId} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Descontando…" : "Descontar del inventario"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
