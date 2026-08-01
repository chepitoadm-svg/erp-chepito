"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearFacturaGasto, type FormState } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}
interface Proveedor {
  id: string;
  nombre: string;
  condicion_venta_default: string | null;
  plazo_credito_default: number | null;
}

interface Props {
  proveedores: Proveedor[];
  cuentas: Opcion[];
  centros: Opcion[];
}

const hoy = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};
const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function FacturaGastoForm({ proveedores, cuentas, centros }: Props) {
  const [state, formAction, pending] = useActionState(crearFacturaGasto, estadoInicial);
  const [proveedor, setProveedor] = useState("");
  const [clave, setClave] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState("");
  const [plazo, setPlazo] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [centro, setCentro] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [conIva, setConIva] = useState(true);
  const [iva, setIva] = useState("");

  function onProveedor(id: string) {
    setProveedor(id);
    const p = proveedores.find((x) => x.id === id);
    if (p) {
      setCondicion(p.condicion_venta_default ?? "");
      setPlazo(p.plazo_credito_default != null ? String(p.plazo_credito_default) : "");
    }
  }

  const base = parseFloat(subtotal) || 0;
  // IVA sugerido 13% si está marcado; el usuario puede sobreescribirlo.
  const ivaCalc = conIva ? (iva !== "" ? parseFloat(iva) || 0 : Math.round(base * 13) / 100) : 0;
  const total = base + ivaCalc;
  const listo = proveedor && cuenta && centro && base > 0;

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <input type="hidden" name="proveedor_id" value={proveedor} />
      <input type="hidden" name="clave" value={clave} />
      <input type="hidden" name="fecha_emision" value={fecha} />
      <input type="hidden" name="condicion_venta" value={condicion} />
      <input type="hidden" name="plazo_credito" value={plazo} />
      <input type="hidden" name="cuenta_gasto_id" value={cuenta} />
      <input type="hidden" name="centro_costo_id" value={centro} />
      <input type="hidden" name="subtotal" value={String(base)} />
      <input type="hidden" name="iva_total" value={String(ivaCalc)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Proveedor</label>
          <select value={proveedor} onChange={(e) => onProveedor(e.target.value)} className={inputCls}>
            <option value="">Seleccioná…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Clave / N.º factura</label>
          <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Cuenta de gasto</label>
        <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
          <option value="">Elegí a qué gasto va…</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Centro de costo (negocio) <span className="text-red-500">*</span>
        </label>
        <select value={centro} onChange={(e) => setCentro(e.target.value)} className={inputCls}>
          <option value="">¿De cuál negocio es este gasto?</option>
          {centros.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.codigo} — {cc.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">
          Obligatorio: define a qué negocio (Chepito 1 / Chepito 2 / Taller) se le carga el gasto.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-neutral-700">Monto (sin IVA)</label>
          <input
            type="number"
            step="any"
            min="0"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            className={inputCls + " text-right"}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700">Condición</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value)} className={inputCls}>
              <option value="">—</option>
              <option value="01">Contado</option>
              <option value="02">Crédito</option>
            </select>
          </div>
          <div className="w-20">
            <label className="block text-sm font-medium text-neutral-700">Plazo</label>
            <input type="number" min="0" value={plazo} onChange={(e) => setPlazo(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} className="h-4 w-4" />
          Lleva IVA (13% acreditable)
        </label>
        {conIva && (
          <div>
            <label className="text-xs text-neutral-500">IVA</label>
            <input
              type="number"
              step="any"
              min="0"
              value={iva}
              onChange={(e) => setIva(e.target.value)}
              placeholder={money(Math.round(base * 13) / 100)}
              className="ml-2 w-32 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm outline-none focus:border-neutral-900"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Concepto / glosa</label>
        <GlosaInput />
      </div>

      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Monto</span>
            <span className="tabular-nums">{money(base)}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>IVA</span>
            <span className="tabular-nums">{money(ivaCalc)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
        </div>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar postea Debe {"<cuenta de gasto>"} (con su centro) +
        Debe IVA / Haber Cuentas por pagar. No entra al inventario.
      </p>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !listo}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link href="/compras/facturas" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function GlosaInput() {
  const [v, setV] = useState("");
  return (
    <input
      name="glosa"
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder="Ej: Servicio de limpieza de julio"
      className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
    />
  );
}
