"use client";

import { useActionState } from "react";
import { cargarSaldoInicial, type FormState } from "@/app/(app)/inventario/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  articulos: Opcion[];
  bodegas: Opcion[];
}

const inicial: FormState = {};
const inputCls =
  "mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

export default function CargaInicialForm({ articulos, bodegas }: Props) {
  const [state, formAction, pending] = useActionState(cargarSaldoInicial, inicial);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div>
        <label className="block text-xs text-neutral-500">Artículo</label>
        <select name="articulo_id" required defaultValue="" className={inputCls + " w-64"}>
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
        <label className="block text-xs text-neutral-500">Bodega</label>
        <select name="bodega_id" required defaultValue="" className={inputCls + " w-56"}>
          <option value="" disabled>
            Seleccioná…
          </option>
          {bodegas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.codigo} — {b.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Cantidad</label>
        <input
          name="cantidad"
          type="number"
          step="any"
          min="0"
          required
          className={inputCls + " w-28 text-right"}
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Costo unitario</label>
        <input
          name="costo_unitario"
          type="number"
          step="any"
          min="0"
          required
          className={inputCls + " w-32 text-right"}
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-500">Fecha (opcional)</label>
        <input name="fecha" type="date" className={inputCls} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Cargando…" : "Cargar existencia"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-green-600">{state.ok}</p>}
    </form>
  );
}
