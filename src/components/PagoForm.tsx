"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearPago, type FormState } from "@/app/(app)/compras/actions";
import { numeroFactura } from "@/lib/compras/numeroFactura";

interface CxP {
  id: string;
  fecha_vencimiento: string | null;
  factura_clave: string | null;
  saldo: number;
}
interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  proveedorId: string;
  proveedorNombre: string;
  cxp: CxP[];
  cuentas: Cuenta[];
}

const hoy = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};

export default function PagoForm({ proveedorId, proveedorNombre, cxp, cuentas }: Props) {
  const [state, formAction, pending] = useActionState(crearPago, estadoInicial);
  const [fecha, setFecha] = useState(hoy());
  const [medio, setMedio] = useState("transferencia");
  const [cuenta, setCuenta] = useState("");
  const [referencia, setReferencia] = useState("");
  const [glosa, setGlosa] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [monto, setMonto] = useState<Record<string, string>>(
    () => Object.fromEntries(cxp.map((q) => [q.id, String(q.saldo)])),
  );

  const lineas = cxp
    .filter((q) => sel[q.id])
    .map((q) => ({ cxp_id: q.id, monto: parseFloat(monto[q.id] ?? "0") || 0 }))
    .filter((l) => l.monto > 0);
  const total = lineas.reduce((s, l) => s + l.monto, 0);
  const lineasJSON = JSON.stringify(lineas);
  const listo = cuenta && lineas.length > 0;

  const inputCls =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="proveedor_id" value={proveedorId} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="medio_pago" value={medio} />
      <input type="hidden" name="cuenta_pago_id" value={cuenta} />
      <input type="hidden" name="referencia" value={referencia} />
      <input type="hidden" name="glosa" value={glosa} />
      <input type="hidden" name="lineas" value={lineasJSON} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Medio</label>
          <select value={medio} onChange={(e) => setMedio(e.target.value)} className={inputCls}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Cuenta de origen</label>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={inputCls}>
            <option value="">Caja o banco…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Referencia</label>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="N.º transf. / cheque"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-neutral-700">
          Facturas pendientes de {proveedorNombre}
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium" />
                <th className="px-3 py-2 font-medium">Factura</th>
                <th className="px-3 py-2 font-medium">Vence</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">A pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {cxp.map((q) => (
                <tr key={q.id} className={sel[q.id] ? "bg-neutral-50/60" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!sel[q.id]}
                      onChange={(e) => setSel((p) => ({ ...p, [q.id]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                    {numeroFactura(q.factura_clave) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{q.fecha_vencimiento ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {money(q.saldo)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max={q.saldo}
                      value={monto[q.id] ?? ""}
                      disabled={!sel[q.id]}
                      onChange={(e) => setMonto((p) => ({ ...p, [q.id]: e.target.value }))}
                      className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right outline-none focus:border-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50">
              <tr className="font-medium">
                <td colSpan={4} className="px-3 py-2 text-right text-neutral-600">
                  Total a pagar
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-900">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">Glosa (opcional)</label>
        <input
          value={glosa}
          onChange={(e) => setGlosa(e.target.value)}
          placeholder="Nota del pago"
          className={inputCls + " max-w-lg"}
        />
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar, postea Debe Cuentas por pagar / Haber la cuenta de
        origen, y marca cada factura como pagada cuando su saldo llega a cero.
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
        <Link href="/compras/pagos" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
