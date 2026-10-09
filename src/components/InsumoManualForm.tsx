"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(app)/produccion/actions";
import { UNIDADES } from "@/lib/validation/produccion";

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  inicial?: {
    id?: string;
    nombre?: string;
    costo_compra?: number;
    cantidad_compra?: number;
    unidad?: string;
    proveedor?: string | null;
  };
}

const estadoInicial: FormState = {};
const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function InsumoManualForm({ modo, action, inicial }: Props) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}

      <div>
        <label className="block text-sm font-medium text-neutral-700">Nombre</label>
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={200}
          defaultValue={inicial?.nombre ?? ""}
          placeholder="Harina flores 25kg"
          className={inputCls}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Costo de compra (₡)</label>
          <input
            name="costo_compra"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={inicial?.costo_compra ?? ""}
            placeholder="17510"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-neutral-500">Lo que cuesta el paquete comprado.</p>
        </div>
        <div className="w-32">
          <label className="block text-sm font-medium text-neutral-700">Cantidad</label>
          <input
            name="cantidad_compra"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={inicial?.cantidad_compra ?? ""}
            placeholder="25"
            className={inputCls}
          />
        </div>
        <div className="w-28">
          <label className="block text-sm font-medium text-neutral-700">Unidad</label>
          <select name="unidad" required defaultValue={inicial?.unidad ?? ""} className={inputCls}>
            <option value="" disabled>
              …
            </option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        Ej.: ₡17.510 por 25 kg → el costo por gramo lo calcula el sistema.
      </p>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Proveedor</label>
        <input
          name="proveedor"
          maxLength={200}
          defaultValue={inicial?.proveedor ?? ""}
          placeholder="Opcional"
          className={inputCls}
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : modo === "crear" ? "Crear insumo" : "Guardar cambios"}
        </button>
        <Link href="/produccion" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
