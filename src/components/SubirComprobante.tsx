"use client";

import { useActionState } from "react";
import { subirComprobante, type FormState } from "@/app/(app)/compras/actions";

const inicial: FormState = {};

export default function SubirComprobante() {
  const [state, formAction, pending] = useActionState(subirComprobante, inicial);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            XML del comprobante <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            name="comprobante"
            accept=".xml,text/xml,application/xml"
            required
            className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
          />
          <p className="mt-1 text-xs text-neutral-500">La factura electrónica (FacturaElectronica).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            XML de respuesta de Hacienda
          </label>
          <input
            type="file"
            name="respuesta"
            accept=".xml,text/xml,application/xml"
            className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
          />
          <p className="mt-1 text-xs text-neutral-500">
            El MensajeHacienda (confirma que quedó Aceptado). Recomendado.
          </p>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Leyendo…" : "Subir y leer"}
      </button>
    </form>
  );
}
