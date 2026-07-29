"use client";

import { useActionState, useState } from "react";
import { anularTransferencia, type FormState } from "@/app/(app)/inventario/actions";

const inicial: FormState = {};

export default function AnularTransferencia({
  id,
  enTransito,
}: {
  id: string;
  enTransito: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState(anularTransferencia, inicial);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      >
        Anular
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="id" value={id} />
      <label className="text-sm font-medium text-red-800">Motivo de la anulación</label>
      <p className="text-xs text-red-700">
        {enTransito
          ? "Devuelve al origen lo que sigue pendiente; lo ya recibido se queda donde entró."
          : "Cancela el borrador. No salió nada de bodega."}
      </p>
      <input
        type="text"
        name="motivo"
        required
        minLength={3}
        placeholder="Ej: el camión se devolvió"
        className="rounded-md border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-500"
      />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Anulando…" : "Confirmar anulación"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
