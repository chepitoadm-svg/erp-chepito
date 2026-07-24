"use client";

import { useActionState, useState } from "react";
import { crearCentro, type FormState } from "@/app/(app)/admin/actions";

const inicial: FormState = {};

export default function CentroCostoForm() {
  const [state, formAction, pending] = useActionState(crearCentro, inicial);
  const [tipo, setTipo] = useState("final");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="block text-xs text-neutral-500">Código</label>
        <input
          name="codigo"
          required
          maxLength={8}
          placeholder="CH3"
          className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm uppercase outline-none focus:border-neutral-900"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Nombre</label>
        <input
          name="nombre"
          required
          placeholder="Chepito 3"
          className="w-48 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Tipo</label>
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
        >
          <option value="final">Final (canal)</option>
          <option value="intermedio">Intermedio (pool)</option>
        </select>
      </div>
      {tipo === "intermedio" && (
        <label className="flex items-center gap-2 pb-1.5 text-sm text-neutral-600">
          <input type="checkbox" name="requiere_prorrateo" className="h-4 w-4" defaultChecked />
          Se prorratea
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Creando…" : "Agregar centro"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-green-600">{state.ok}</p>}
    </form>
  );
}
