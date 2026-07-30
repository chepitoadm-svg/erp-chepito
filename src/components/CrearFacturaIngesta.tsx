"use client";

import { useState } from "react";
import { crearFacturaDesdeIngesta } from "@/app/(app)/compras/actions";

interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}

export default function CrearFacturaIngesta({
  id,
  bodegas,
}: {
  id: string;
  bodegas: Bodega[];
}) {
  const [bodega, setBodega] = useState("");

  return (
    <form action={crearFacturaDesdeIngesta} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="block text-xs text-neutral-500">Bodega de ingreso</label>
        <select
          name="bodega_id"
          value={bodega}
          onChange={(e) => setBodega(e.target.value)}
          className="mt-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          <option value="">Seleccioná…</option>
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.codigo} — {b.nombre}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={!bodega}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
      >
        Crear factura de compra
      </button>
    </form>
  );
}
