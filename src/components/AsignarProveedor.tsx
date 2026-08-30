"use client";

import { useState, type MouseEvent } from "react";
import { asignarAliasProveedor } from "@/app/(app)/tesoreria/conciliaciones/actions";
import { extraerIdentificador } from "@/lib/bancoAlias";

// Muestra el proveedor detectado de una línea del banco (chip + tooltip), o un
// botón para asignarlo (aprende: guarda el identificador ligado al proveedor).
export default function AsignarProveedor({
  referencia,
  descripcion,
  proveedorNombre,
  proveedores,
  editable,
}: {
  referencia: string | null;
  descripcion: string | null;
  proveedorNombre: string | null;
  proveedores: { id: string; nombre: string }[];
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const stop = (e: MouseEvent) => e.stopPropagation();

  if (proveedorNombre) {
    return (
      <span
        title={`Proveedor: ${proveedorNombre}`}
        className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
      >
        🏷️ {proveedorNombre}
      </span>
    );
  }

  if (!editable) return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setAbierto(true);
        }}
        className="ml-1 text-[10px] text-neutral-300 hover:text-blue-600"
        title="Asignar el proveedor de esta cuenta"
      >
        + proveedor
      </button>
    );
  }

  return (
    <form
      action={asignarAliasProveedor}
      onClick={stop}
      className="mt-1 flex flex-wrap items-center gap-1 rounded border border-neutral-300 bg-white p-1"
    >
      <select
        name="proveedor_id"
        required
        defaultValue=""
        className="rounded border border-neutral-300 px-1 py-0.5 text-[11px] outline-none"
      >
        <option value="" disabled>
          Proveedor…
        </option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <input
        name="alias"
        defaultValue={extraerIdentificador(referencia, descripcion)}
        className="w-28 rounded border border-neutral-300 px-1 py-0.5 text-[11px] outline-none"
        title="Identificador que aparece en el banco (cuenta destino, SINPE…)"
      />
      <button type="submit" className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-neutral-800">
        Guardar
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="px-1 text-[11px] text-neutral-400 hover:text-neutral-700"
      >
        ✕
      </button>
    </form>
  );
}
