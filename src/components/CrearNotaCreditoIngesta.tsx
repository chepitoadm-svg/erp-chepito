"use client";

import SelectBuscable from "@/components/SelectBuscable";
import { crearNotaCreditoDesdeIngesta } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

// Form del ingestor para registrar un comprobante que es Nota de Crédito/Débito
// como nota de crédito (cabecera). El monto (subtotal + IVA) viene del XML; acá
// solo se elige la cuenta contable y, opcional, el centro de costo.
export default function CrearNotaCreditoIngesta({
  id,
  cuentas,
  centros,
  cuentaDefault,
}: {
  id: string;
  cuentas: Opcion[];
  centros: Opcion[];
  cuentaDefault?: string;
}) {
  const selCls =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <form action={crearNotaCreditoDesdeIngesta} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-[260px] flex-1">
        <label className="block text-xs text-neutral-500">Cuenta de la nota de crédito</label>
        <SelectBuscable
          name="cuenta_id"
          defaultValue={cuentaDefault ?? ""}
          placeholder="Elegí la cuenta…"
          options={cuentas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
          className={selCls}
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Centro de costo (opcional)</label>
        <select name="centro_costo_id" className={selCls}>
          <option value="">— Sin centro —</option>
          {centros.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.codigo} — {cc.nombre}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Registrar nota de crédito
      </button>
    </form>
  );
}
