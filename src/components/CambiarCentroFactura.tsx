"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarCentroFactura, type FormState } from "@/app/(app)/compras/actions";

type Centro = { id: string; codigo: string; nombre: string; tipo: string };

// Selector para corregir a qué centro (sucursal/canal) se carga el gasto. El
// botón Guardar solo aparece cuando el valor cambió. Al guardar refresca la
// página para reflejar el asiento ya reetiquetado.
export default function CambiarCentroFactura({
  facturaId,
  centroActual,
  centros,
}: {
  facturaId: string;
  centroActual: string | null;
  centros: Centro[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState(centroActual ?? "");
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await cambiarCentroFactura(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, {});
  const cambiado = sel !== (centroActual ?? "");

  return (
    <form action={action} className="mt-0.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={facturaId} />
      <select
        name="centro_costo_id"
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm font-medium text-neutral-900"
      >
        {centros.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} — {c.nombre}
          </option>
        ))}
      </select>
      {cambiado && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      )}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && !cambiado && <span className="text-xs text-green-600">{state.ok}</span>}
    </form>
  );
}
