"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearDevolucion, type FormState } from "@/app/(app)/compras/actions";

interface LineaFactura {
  articulo_id: string;
  articulo_codigo: string;
  articulo_nombre: string;
  cantidad_facturada: number;
  costo_unitario: number;
  iva_rate: number; // proporción (ej. 0.13)
}
interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  facturaId: string;
  bodegas: Bodega[];
  bodegaDefault: string;
  lineas: LineaFactura[];
}

const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};

export default function DevolucionForm({ facturaId, bodegas, bodegaDefault, lineas }: Props) {
  const [state, formAction, pending] = useActionState(crearDevolucion, estadoInicial);
  const [bodega, setBodega] = useState(bodegaDefault);
  const [motivo, setMotivo] = useState("");
  const [cant, setCant] = useState<Record<string, string>>({});

  const calc = lineas.map((l) => {
    const q = parseFloat(cant[l.articulo_id] ?? "0") || 0;
    const base = Math.round(q * l.costo_unitario * 100) / 100;
    const iva = Math.round(base * l.iva_rate * 100) / 100;
    return { q, base, iva };
  });
  const subtotal = calc.reduce((s, x) => s + x.base, 0);
  const ivaTotal = calc.reduce((s, x) => s + x.iva, 0);

  const lineasJSON = JSON.stringify(
    lineas
      .map((l, i) => ({ articulo_id: l.articulo_id, cantidad: calc[i].q }))
      .filter((r) => r.cantidad > 0),
  );
  const listo = bodega && motivo.trim().length >= 3 && JSON.parse(lineasJSON).length > 0;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="factura_id" value={facturaId} />
      <input type="hidden" name="bodega_id" value={bodega} />
      <input type="hidden" name="motivo" value={motivo} />
      <input type="hidden" name="lineas" value={lineasJSON} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Bodega de salida</label>
          <select
            value={bodega}
            onChange={(e) => setBodega(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Seleccioná…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} — {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Motivo</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Producto vencido, dañado, etc."
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Facturado</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 text-right font-medium">Devolver</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">IVA ₡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lineas.map((l, i) => (
              <tr key={l.articulo_id}>
                <td className="px-3 py-2 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                  {l.articulo_nombre}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(l.cantidad_facturada)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(l.costo_unitario)}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={l.cantidad_facturada}
                    value={cant[l.articulo_id] ?? ""}
                    onChange={(e) =>
                      setCant((p) => ({ ...p, [l.articulo_id]: e.target.value }))
                    }
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(calc[i].base)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(calc[i].iva)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr className="font-medium">
              <td colSpan={4} className="px-3 py-2 text-right text-neutral-500">
                Totales
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{money(subtotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(ivaTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar, baja el inventario al costo
        promedio, revierte el IVA y baja la cuenta por pagar de esta factura.
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
        <Link
          href="/compras/devoluciones"
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
