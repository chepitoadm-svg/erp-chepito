"use client";

import { useState } from "react";
import { crearFacturaDesdeIngesta } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

export default function CrearFacturaIngesta({
  id,
  bodegas,
  centros,
}: {
  id: string;
  bodegas: Opcion[];
  centros: Opcion[];
}) {
  const [bodega, setBodega] = useState("");
  const [centro, setCentro] = useState("");
  const selCls =
    "mt-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <form action={crearFacturaDesdeIngesta} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="block text-xs text-neutral-500">Bodega de ingreso</label>
        <select name="bodega_id" value={bodega} onChange={(e) => setBodega(e.target.value)} className={selCls}>
          <option value="">Seleccioná…</option>
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.codigo} — {b.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Centro de costo (negocio)</label>
        <select name="centro_costo_id" value={centro} onChange={(e) => setCentro(e.target.value)} className={selCls}>
          <option value="">¿De cuál negocio?</option>
          {centros.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.codigo} — {cc.nombre}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={!bodega || !centro}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
      >
        Crear factura de compra
      </button>
    </form>
  );
}
