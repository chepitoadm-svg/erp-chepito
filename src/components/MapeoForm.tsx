"use client";

import { useActionState } from "react";
import { agregarMapeo, type FormState } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  proveedorId: string;
  articulos: Opcion[];
  unidades: Opcion[];
}

const inicial: FormState = {};
const inputCls =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

export default function MapeoForm({ proveedorId, articulos, unidades }: Props) {
  const [state, formAction, pending] = useActionState(agregarMapeo, inicial);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <input type="hidden" name="proveedor_id" value={proveedorId} />
      <div>
        <label className="block text-xs text-neutral-500">Código comercial</label>
        <input name="codigo_comercial" required className={inputCls + " w-32"} placeholder="7501…" />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Artículo</label>
        <select name="articulo_id" required defaultValue="" className={inputCls + " w-56"}>
          <option value="" disabled>
            Seleccioná…
          </option>
          {articulos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo} — {a.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Unidad compra</label>
        <select name="unidad_compra_id" required defaultValue="" className={inputCls + " w-28"}>
          <option value="" disabled>
            …
          </option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Factor a stock</label>
        <input
          name="factor_a_stock"
          type="number"
          step="any"
          min="0"
          required
          defaultValue="1"
          className={inputCls + " w-24"}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar mapeo"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-green-600">{state.ok}</p>}
    </form>
  );
}
