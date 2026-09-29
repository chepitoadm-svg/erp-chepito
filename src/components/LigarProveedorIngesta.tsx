"use client";

import SelectBuscable from "@/components/SelectBuscable";
import { ligarCedulaProveedorIngesta } from "@/app/(app)/compras/actions";

// En el ingestor, cuando el emisor no calza con ningún proveedor: opción de
// ligar esa cédula a un proveedor QUE YA EXISTE (mismo proveedor que factura con
// otra cédula, ej. su cédula física). Alternativa a "crear proveedor nuevo".
export default function LigarProveedorIngesta({
  id,
  proveedores,
}: {
  id: string;
  proveedores: { id: string; nombre: string }[];
}) {
  return (
    <form action={ligarCedulaProveedorIngesta} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-[260px]">
        <label className="block text-xs text-red-700/80">…o es un proveedor que ya tenés (ligar la cédula)</label>
        <SelectBuscable
          name="proveedor_id"
          placeholder="Buscar proveedor existente…"
          options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>
      <button
        type="submit"
        className="rounded-md border border-neutral-400 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        Ligar la cédula a ese proveedor
      </button>
    </form>
  );
}
