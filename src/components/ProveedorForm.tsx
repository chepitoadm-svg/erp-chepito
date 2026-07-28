"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cuentasCxp: Opcion[];
  inicial?: {
    id?: string;
    cedula_juridica?: string;
    nombre?: string;
    condicion_venta_default?: string | null;
    plazo_credito_default?: number | null;
    cuenta_cxp_id?: string | null;
  };
}

const estadoInicial: FormState = {};
const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function ProveedorForm({ modo, action, cuentasCxp, inicial }: Props) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}

      <div className="flex gap-3">
        <div className="w-48">
          <label className="block text-sm font-medium text-neutral-700">Cédula jurídica</label>
          <input
            name="cedula_juridica"
            required
            defaultValue={inicial?.cedula_juridica ?? ""}
            placeholder="3101123456"
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Nombre</label>
          <input
            name="nombre"
            required
            minLength={2}
            defaultValue={inicial?.nombre ?? ""}
            placeholder="Distribuidora Universal"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-neutral-700">Condición de venta</label>
          <select
            name="condicion_venta_default"
            defaultValue={inicial?.condicion_venta_default ?? ""}
            className={inputCls}
          >
            <option value="">— Sin definir —</option>
            <option value="01">Contado (01)</option>
            <option value="02">Crédito (02)</option>
          </select>
        </div>
        <div className="w-40">
          <label className="block text-sm font-medium text-neutral-700">Plazo crédito (días)</label>
          <input
            name="plazo_credito_default"
            type="number"
            min={0}
            max={365}
            defaultValue={inicial?.plazo_credito_default ?? ""}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Cuenta de CxP</label>
        <select
          name="cuenta_cxp_id"
          defaultValue={inicial?.cuenta_cxp_id ?? ""}
          className={inputCls}
        >
          <option value="">— Cuenta de CxP por defecto —</option>
          {cuentasCxp.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">
          Si se deja vacío, las facturas usan la CxP general (21-10-01).
        </p>
      </div>

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
          {pending ? "Guardando…" : modo === "crear" ? "Crear proveedor" : "Guardar cambios"}
        </button>
        <Link href="/compras/proveedores" className="text-sm text-neutral-600 hover:text-neutral-900">
          {modo === "crear" ? "Ver lista" : "Cancelar"}
        </Link>
      </div>
    </form>
  );
}
