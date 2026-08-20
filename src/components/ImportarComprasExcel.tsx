"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  analizarCompras,
  importarCompras,
  type AnalisisComprasState,
  type FormState,
} from "@/app/(app)/compras/importar/actions";

const inicialA: AnalisisComprasState = {};
const inicialI: FormState = {};

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportarComprasExcel() {
  const [a, analizar, analizando] = useActionState(analizarCompras, inicialA);
  const [imp, importar, importando] = useActionState(importarCompras, inicialI);

  const nuevos = (a.proveedores ?? []).filter((p) => p.estado === "nuevo");
  const existen = (a.proveedores ?? []).filter((p) => p.estado === "existe");

  return (
    <div className="space-y-6">
      <form action={analizar} className="max-w-xl space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Excel de compras</span>
          <input
            type="file"
            name="archivo"
            required
            accept=".xlsx"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
          />
        </label>
        {a.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{a.error}</p>
        )}
        <button
          type="submit"
          disabled={analizando}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {analizando ? "Leyendo…" : "Analizar archivo"}
        </button>
      </form>

      {a.filas != null && a.filas > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            {a.filas} facturas de compra · total ₡{fmt(a.total ?? 0)}
          </h2>

          <div className="max-w-xl overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Centro (bodega)</th>
                  <th className="px-4 py-3 text-right font-medium">Facturas</th>
                  <th className="px-4 py-3 text-right font-medium">IVA</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(a.centros ?? []).map((c) => (
                  <tr key={c.codigo}>
                    <td className="px-4 py-3 text-neutral-800">{c.codigo}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{c.n}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{fmt(c.iva)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{fmt(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="max-w-xl rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
            <p>
              <b>Proveedores:</b> {existen.length} ya existen
              {nuevos.length > 0 && (
                <>
                  , <b className="text-amber-700">{nuevos.length} se crearán</b> (cédula temporal, la corregís
                  después): {nuevos.map((p) => p.razon).join(", ")}
                </>
              )}
              .
            </p>
          </div>

          {!!a.pagadas && a.pagadas > 0 && (
            <p className="max-w-xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {a.pagadas} {a.pagadas === 1 ? "factura viene" : "facturas vienen"} marcadas como pagadas; se
              importan como cuenta por pagar igual. Registrales el pago después en <b>Pagos</b>.
            </p>
          )}
          {!!a.ignoradas?.length && (
            <p className="max-w-xl rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Se ignoró {a.ignoradas.length === 1 ? "1 fila" : `${a.ignoradas.length} filas`} sin bodega/centro
              (ej. la fila de total del Excel).
            </p>
          )}

          <form action={importar}>
            <input type="hidden" name="filas" value={JSON.stringify(a.filas_data ?? [])} />
            <button
              type="submit"
              disabled={importando}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {importando ? "Importando…" : `Importar y postear las ${a.filas} compras`}
            </button>
          </form>
          <p className="text-xs text-neutral-500">
            Cada compra postea Debe 51-10 Compras (por centro) + IVA / Haber Cuentas por pagar.
          </p>

          {imp.ok && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {imp.ok}{" "}
              <Link href="/compras/facturas" className="font-medium underline hover:no-underline">
                Ver facturas
              </Link>
            </p>
          )}
          {imp.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{imp.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
