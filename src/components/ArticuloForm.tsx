"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(app)/inventario/actions";
import type { ArticuloTipo } from "@/types/database";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
  porcentaje?: number;
}

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  unidades: Opcion[];
  tarifas: Opcion[];
  cuentas: Opcion[];
  inicial?: {
    id?: string;
    codigo?: string;
    nombre?: string;
    tipo?: ArticuloTipo;
    unidad_stock_id?: string;
    iva_tarifa_id?: string;
    cuenta_inventario_id?: string | null;
    cabys_codigo?: string | null;
    inventariable?: boolean;
  };
}

const estadoInicial: FormState = {};
const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function ArticuloForm({
  modo,
  action,
  unidades,
  tarifas,
  cuentas,
  inicial,
}: Props) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}

      <div className="flex gap-3">
        <div className="w-40">
          <label className="block text-sm font-medium text-neutral-700">Código</label>
          <input
            name="codigo"
            required
            maxLength={40}
            defaultValue={inicial?.codigo ?? ""}
            placeholder="HARINA"
            className={inputCls + " uppercase"}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Nombre</label>
          <input
            name="nombre"
            required
            minLength={2}
            defaultValue={inicial?.nombre ?? ""}
            placeholder="Harina de trigo"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Tipo</label>
        <select name="tipo" defaultValue={inicial?.tipo ?? "materia_prima"} className={inputCls}>
          <option value="materia_prima">Materia prima</option>
          <option value="producto_terminado">Producto terminado</option>
          <option value="suministro">Suministro</option>
        </select>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Unidad de stock</label>
          <select
            name="unidad_stock_id"
            required
            defaultValue={inicial?.unidad_stock_id ?? ""}
            className={inputCls}
          >
            <option value="" disabled>
              Seleccioná…
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo} — {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Tarifa de IVA</label>
          <select
            name="iva_tarifa_id"
            required
            defaultValue={inicial?.iva_tarifa_id ?? ""}
            className={inputCls}
          >
            <option value="" disabled>
              Seleccioná…
            </option>
            {tarifas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Cuenta de inventario
        </label>
        <select
          name="cuenta_inventario_id"
          defaultValue={inicial?.cuenta_inventario_id ?? ""}
          className={inputCls}
        >
          <option value="">— Sin cuenta específica —</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">
          A dónde postea el valor del inventario de este artículo.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Código CAByS</label>
        <input
          name="cabys_codigo"
          defaultValue={inicial?.cabys_codigo ?? ""}
          placeholder="Opcional"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Informativo (Hacienda). No manda la tarifa de IVA.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="inventariable"
          defaultChecked={inicial?.inventariable ?? true}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Inventariable (lleva kardex y existencias)
      </label>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-green-600">{state.ok}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : modo === "crear" ? "Crear artículo" : "Guardar cambios"}
        </button>
        <Link href="/inventario/articulos" className="text-sm text-neutral-600 hover:text-neutral-900">
          {modo === "crear" ? "Ver lista" : "Cancelar"}
        </Link>
      </div>
    </form>
  );
}
