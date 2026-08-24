"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearNotaCredito, type FormState } from "@/app/(app)/compras/actions";
import SelectBuscable, { type OpcionBuscable } from "@/components/SelectBuscable";

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}
interface Props {
  proveedores: OpcionBuscable[];
  cuentas: OpcionBuscable[];
  centros: Centro[];
  cuentaDefault?: string;
}

const hoy = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inicial: FormState = {};

export default function NotaCreditoForm({ proveedores, cuentas, centros, cuentaDefault }: Props) {
  const [state, formAction, pending] = useActionState(crearNotaCredito, inicial);
  const [proveedor, setProveedor] = useState("");
  const [cuenta, setCuenta] = useState(cuentaDefault ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [centro, setCentro] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("");

  const total = (parseFloat(subtotal) || 0) + (parseFloat(iva) || 0);
  const listo = proveedor && cuenta && (parseFloat(subtotal) || 0) > 0;
  const inputCls =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <input type="hidden" name="proveedor_id" value={proveedor} />
      <input type="hidden" name="cuenta_id" value={cuenta} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="centro_costo_id" value={centro} />
      <input type="hidden" name="subtotal" value={subtotal} />
      <input type="hidden" name="iva" value={iva} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Proveedor</label>
          <SelectBuscable value={proveedor} onChange={setProveedor} placeholder="Buscá el proveedor…" options={proveedores} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Cuenta (contrapartida)</label>
          <SelectBuscable value={cuenta} onChange={setCuenta} placeholder="Descuentos sobre compras…" options={cuentas} className={inputCls} />
          <p className="mt-1 text-xs text-neutral-400">A dónde va el crédito (ej. Descuentos sobre compras).</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Centro de costo</label>
          <select value={centro} onChange={(e) => setCentro(e.target.value)} className={inputCls}>
            <option value="">— sin centro —</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">Obligatorio si la cuenta es de gasto/ingreso.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Monto (base, sin IVA)</label>
          <input type="number" step="any" min="0" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0,00" className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">IVA (si aplica)</label>
          <input type="number" step="any" min="0" value={iva} onChange={(e) => setIva(e.target.value)} placeholder="0,00" className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Total del crédito</label>
          <div className="mt-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold tabular-nums text-neutral-900">
            {money(total)}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">N.º de nota / referencia</label>
        <input name="referencia" placeholder="Ej: NC-12345" className={inputCls + " max-w-sm"} />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">Glosa (opcional)</label>
        <input name="glosa" placeholder="Motivo del crédito" className={inputCls + " max-w-lg"} />
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Postea Debe Cuentas por pagar / Haber la cuenta elegida (+ reversa de IVA). Queda como saldo <b>a favor</b> del
        proveedor y se netea al pagar sus facturas.
      </p>

      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !listo}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Crear nota de crédito"}
        </button>
        <Link href="/compras/cxp" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
