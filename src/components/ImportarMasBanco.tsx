"use client";

import { useActionState, useRef } from "react";
import { agregarEstadoCuenta, type FormState } from "@/app/(app)/tesoreria/conciliaciones/actions";

const inicial: FormState = {};

export default function ImportarMasBanco({ conciliacionId }: { conciliacionId: string }) {
  const [state, action, pending] = useActionState(agregarEstadoCuenta, inicial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <details className="rounded-lg border border-neutral-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
        + Importar más movimientos del banco
      </summary>
      <form
        ref={formRef}
        action={(fd) => {
          action(fd);
          formRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2 border-t border-neutral-200 p-3"
      >
        <input type="hidden" name="id" value={conciliacionId} />
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado de cuenta (.xls del BAC) — podés subirlo por partes
          <input
            type="file"
            name="archivo"
            required
            accept=".xls,.xlsx"
            className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Importando…" : "Importar y emparejar"}
        </button>
        {state.ok && <span className="text-sm text-green-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </form>
      <p className="px-3 pb-3 text-xs text-neutral-400">
        Agrega solo los movimientos nuevos (los que ya estén no se duplican) y vuelve a emparejar automáticamente.
      </p>
    </details>
  );
}
