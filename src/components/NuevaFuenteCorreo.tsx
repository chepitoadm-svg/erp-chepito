"use client";

import { useActionState } from "react";
import { crearFuenteCorreo, type FormState } from "@/app/(app)/compras/correo/actions";

const inicial: FormState = {};
const inputCls =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function NuevaFuenteCorreo({ hoy }: { hoy: string }) {
  const [state, formAction, pending] = useActionState(crearFuenteCorreo, inicial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Remitente (correo)</span>
        <input name="remitente" required placeholder="facturacion@proveedor.com" className={inputCls + " mt-1 w-64"} />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Nombre</span>
        <input name="etiqueta" required placeholder="Proveedor" className={inputCls + " mt-1 w-48"} />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Desde</span>
        <input type="date" name="desde" required defaultValue={hoy} className={inputCls + " mt-1"} />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Solo cédula (opcional)</span>
        <input name="cedula_emisor" placeholder="si es compartido" className={inputCls + " mt-1 w-40"} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar remitente"}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && <span className="text-sm text-green-700">{state.ok}</span>}
    </form>
  );
}
