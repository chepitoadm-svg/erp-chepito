"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearCierre, type FormState } from "@/app/(app)/inventario/actions";

interface Articulo {
  articulo_id: string;
  codigo: string;
  nombre: string;
  cantidad_teorica: number;
  costo_promedio: number;
}

interface Props {
  bodegaId: string;
  bodegaLabel: string;
  articulos: Articulo[];
}

const hoyCR = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};

export default function CierreForm({ bodegaId, bodegaLabel, articulos }: Props) {
  const [state, formAction, pending] = useActionState(crearCierre, estadoInicial);
  const [fecha, setFecha] = useState(hoyCR());
  // Conteo físico por artículo; arranca en la cantidad teórica.
  const [fis, setFis] = useState<Record<string, string>>(() =>
    Object.fromEntries(articulos.map((a) => [a.articulo_id, String(a.cantidad_teorica)])),
  );

  const filas = articulos.map((a) => {
    const f = parseFloat(fis[a.articulo_id] ?? "0") || 0;
    const vTeo = Math.round(a.cantidad_teorica * a.costo_promedio * 100) / 100;
    const vFis = Math.round(f * a.costo_promedio * 100) / 100;
    return { ...a, fisico: f, vTeo, vFis, dif: Math.round((vFis - vTeo) * 100) / 100 };
  });
  const totalTeo = filas.reduce((s, x) => s + x.vTeo, 0);
  const totalFis = filas.reduce((s, x) => s + x.vFis, 0);
  const totalDif = Math.round((totalFis - totalTeo) * 100) / 100;

  const lineasJSON = JSON.stringify(
    articulos.map((a) => ({
      articulo_id: a.articulo_id,
      cantidad_fisica: parseFloat(fis[a.articulo_id] ?? "0") || 0,
    })),
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="bodega_id" value={bodegaId} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={lineasJSON} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Bodega</div>
          <div className="font-medium text-neutral-900">{bodegaLabel}</div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Fecha de cierre</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Teórico</th>
              <th className="px-4 py-3 text-right font-medium">Conteo físico</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
              <th className="px-4 py-3 text-right font-medium">Valor físico</th>
              <th className="px-4 py-3 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filas.map((a) => (
              <tr key={a.articulo_id}>
                <td className="px-4 py-3 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{a.codigo}</span> — {a.nombre}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {money(a.cantidad_teorica)}
                </td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={fis[a.articulo_id] ?? ""}
                    onChange={(e) => setFis((p) => ({ ...p, [a.articulo_id]: e.target.value }))}
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {money(a.costo_promedio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{money(a.vFis)}</td>
                <td
                  className={
                    "px-4 py-3 text-right tabular-nums " +
                    (a.dif < 0 ? "text-red-600" : a.dif > 0 ? "text-amber-700" : "text-neutral-400")
                  }
                >
                  {money(a.dif)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
            <tr className="font-medium">
              <td className="px-4 py-2 text-neutral-600">Totales</td>
              <td />
              <td />
              <td className="px-4 py-2 text-right text-neutral-500">teórico {money(totalTeo)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-neutral-900">{money(totalFis)}</td>
              <td
                className={
                  "px-4 py-2 text-right tabular-nums " +
                  (totalDif < 0 ? "text-red-600" : totalDif > 0 ? "text-amber-700" : "text-neutral-400")
                }
              >
                {money(totalDif)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar, ajusta el Inventario contra el cierre anterior (Debe
        Inventario / Haber Ajuste con el centro del negocio, o al revés), pega el faltante al costo, y
        deja el kardex igual al conteo. Corré esto ANTES del prorrateo del Taller.
      </p>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || articulos.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link href="/inventario/cierre" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
