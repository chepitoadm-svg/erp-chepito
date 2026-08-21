"use client";

import { useActionState } from "react";
import { importarEstadoCuenta, type FormState } from "@/app/(app)/tesoreria/conciliaciones/actions";
import type { CuentaBanco } from "@/lib/data/conciliaciones";

const inicial: FormState = {};

export default function ImportarEstadoCuentaForm({ cuentas, hoy }: { cuentas: CuentaBanco[]; hoy: string }) {
  const [state, formAction, pending] = useActionState(importarEstadoCuenta, inicial);
  const campo =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500";

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Cuenta bancaria</span>
          <select name="cuenta_id" required defaultValue="" className={campo}>
            <option value="" disabled>
              Elegí la cuenta…
            </option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Fecha de corte</span>
          <input type="date" name="fecha_corte" required defaultValue={hoy} className={campo} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Estado de cuenta (.xls del BAC)</span>
        <input
          type="file"
          name="archivo"
          required
          accept=".xls,.xlsx"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
        />
      </label>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Importando…" : "Importar y emparejar"}
      </button>
    </form>
  );
}
