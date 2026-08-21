"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { crearGasto, crearProveedorRapido, type FormState } from "@/app/(app)/gastos/actions";

export interface GastoInicial {
  id: string;
  centro_costo_id: string;
  fecha: string;
  cuenta_gasto_id: string;
  cuenta_pago_id: string;
  proveedor_id: string | null;
  fecha_vencimiento: string | null;
  subtotal: number;
  iva: number;
  descripcion: string | null;
}

type AccionGasto = (prev: FormState, formData: FormData) => Promise<FormState>;
import type { CuentaOpcion, CuentasPagoGasto } from "@/lib/data/gastos";

const inicial: FormState = {};

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parse = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

interface Proveedor {
  id: string;
  nombre: string;
}

export default function GastoForm({
  centros,
  cuentasGasto,
  cuentasPago,
  proveedores,
  hoy,
  accion = crearGasto,
  initial,
}: {
  centros: Centro[];
  cuentasGasto: CuentaOpcion[];
  cuentasPago: CuentasPagoGasto;
  proveedores: Proveedor[];
  hoy: string;
  accion?: AccionGasto;
  initial?: GastoInicial;
}) {
  const [state, formAction, pending] = useActionState(accion, inicial);
  const [subtotal, setSubtotal] = useState(initial ? String(initial.subtotal) : "");
  const [iva, setIva] = useState(initial ? String(initial.iva) : "");
  const [modo, setModo] = useState<"pagado" | "por_pagar">(initial?.proveedor_id ? "por_pagar" : "pagado");

  // Proveedor: lista + los creados al vuelo desde este form.
  const [provExtra, setProvExtra] = useState<Proveedor[]>([]);
  const [provSel, setProvSel] = useState(initial?.proveedor_id ?? "");
  const [nuevoProv, setNuevoProv] = useState(false);
  const [pNombre, setPNombre] = useState("");
  const [pCedula, setPCedula] = useState("");
  const [pError, setPError] = useState("");
  const [pPending, startProv] = useTransition();
  const todosProveedores = [...proveedores, ...provExtra];

  const crearProv = () => {
    setPError("");
    startProv(async () => {
      const r = await crearProveedorRapido(pNombre, pCedula);
      if (!r.ok) {
        setPError(r.error);
        return;
      }
      setProvExtra((x) => [...x, { id: r.id, nombre: r.nombre }]);
      setProvSel(r.id);
      setNuevoProv(false);
      setPNombre("");
      setPCedula("");
    });
  };

  const total = useMemo(() => parse(subtotal) + parse(iva), [subtotal, iva]);
  const sugerirIva = () => setIva((Math.round(parse(subtotal) * 0.13 * 100) / 100).toString());

  const campo =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500";
  const campoNum =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-neutral-500";

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Centro de costo</span>
          <select name="centro_costo_id" required defaultValue={initial?.centro_costo_id ?? ""} className={campo}>
            <option value="" disabled>
              Elegí el centro…
            </option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Fecha</span>
          <input type="date" name="fecha" required defaultValue={initial?.fecha ?? hoy} className={campo} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Cuenta de gasto</span>
        <select name="cuenta_gasto_id" required defaultValue={initial?.cuenta_gasto_id ?? ""} className={campo}>
          <option value="" disabled>
            Elegí la cuenta…
          </option>
          {cuentasGasto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <input type="hidden" name="modo" value={modo} />
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Forma de pago</span>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setModo("pagado")}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              modo === "pagado"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Pagado (caja / banco)
          </button>
          <button
            type="button"
            onClick={() => setModo("por_pagar")}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              modo === "por_pagar"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Queda por pagar
          </button>
        </div>

        {modo === "pagado" ? (
          <label className="mt-3 block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">¿De dónde sale?</span>
            <select name="cuenta_pago_id" required defaultValue={initial?.cuenta_pago_id ?? ""} className={campo}>
              <option value="" disabled>
                Elegí caja / banco…
              </option>
              {cuentasPago.pagado_con.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
                Proveedor / beneficiario
                <button
                  type="button"
                  onClick={() => {
                    setNuevoProv((v) => !v);
                    setPError("");
                  }}
                  className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium normal-case text-neutral-600 hover:bg-neutral-50"
                >
                  {nuevoProv ? "Cancelar" : "+ Nuevo"}
                </button>
              </span>
              <select
                name="proveedor_id"
                required
                value={provSel}
                onChange={(e) => setProvSel(e.target.value)}
                className={campo}
              >
                <option value="" disabled>
                  Elegí el proveedor…
                </option>
                {todosProveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Vence</span>
              <input
                type="date"
                name="fecha_vencimiento"
                required
                defaultValue={initial?.fecha_vencimiento ?? hoy}
                className={campo}
              />
            </label>

            {nuevoProv && (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
                <p className="mb-2 text-xs font-medium text-neutral-700">Nuevo proveedor</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={pNombre}
                    onChange={(e) => setPNombre(e.target.value)}
                    placeholder="Nombre / beneficiario"
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                  />
                  <input
                    type="text"
                    value={pCedula}
                    onChange={(e) => setPCedula(e.target.value)}
                    placeholder="Cédula jurídica (o física)"
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                  />
                </div>
                {pError && <p className="mt-2 text-xs text-red-600">{pError}</p>}
                <button
                  type="button"
                  onClick={crearProv}
                  disabled={pPending}
                  className="mt-2 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {pPending ? "Creando…" : "Crear proveedor"}
                </button>
              </div>
            )}
            <p className="text-xs text-neutral-500 sm:col-span-2">
              Queda como cuenta por pagar; lo pagás después en <b>Compras → Pagos</b>.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Monto del gasto</span>
            <input
              type="number"
              name="subtotal"
              min="0"
              step="any"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              placeholder="0.00"
              className={campoNum}
            />
          </label>
          <label className="block">
            <span className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
              IVA acreditable (opcional)
              <button
                type="button"
                onClick={sugerirIva}
                className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium normal-case text-neutral-600 hover:bg-neutral-50"
              >
                13%
              </button>
            </span>
            <input
              type="number"
              name="iva"
              min="0"
              step="any"
              value={iva}
              onChange={(e) => setIva(e.target.value)}
              placeholder="0.00"
              className={campoNum}
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-sm text-neutral-500">Total</span>
          <span className="text-lg font-semibold tabular-nums text-neutral-900">₡{fmt(total)}</span>
        </div>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Descripción (opcional)</span>
        <input
          type="text"
          name="descripcion"
          maxLength={300}
          defaultValue={initial?.descripcion ?? ""}
          placeholder="Ej: alquiler de julio, recibo de luz…"
          className={campo}
        />
      </label>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || parse(subtotal) <= 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar borrador"}
        </button>
        <span className="text-sm text-neutral-500">
          {initial ? "Si el gasto estaba confirmado, se rehace el asiento solo." : "El asiento se postea al confirmar."}
        </span>
      </div>
    </form>
  );
}
