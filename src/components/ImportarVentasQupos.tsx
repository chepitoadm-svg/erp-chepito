"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  analizarQupos,
  registrarVentaImportada,
  registrarTodasImportadas,
  type AnalisisQuposState,
  type FormState,
} from "@/app/(app)/ventas/actions";
import type { DiaVentaQupos } from "@/lib/xlsx/qupos";

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inicialAnalisis: AnalisisQuposState = {};
const inicialFila: FormState = {};

// Una fila del preview: registra la venta de ese día (reusa el posteo normal).
function FilaDia({ dia, centro }: { dia: DiaVentaQupos; centro: Centro }) {
  const [state, formAction, pending] = useActionState(registrarVentaImportada, inicialFila);
  const glosa = `QuPOS ${dia.fecha} · ${dia.tickets} tickets`;
  return (
    <tr>
      <td className="px-4 py-3 text-neutral-700">{dia.fecha}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(dia.gravado)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(dia.exento)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(dia.iva)}</td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
        {fmt(dia.total)}
      </td>
      <td className="px-4 py-3 text-center text-xs text-neutral-500">
        {dia.tickets}t · {dia.lineas}l
      </td>
      <td className="px-4 py-3 text-right">
        <form action={formAction}>
          <input type="hidden" name="centro_costo_id" value={centro.id} />
          <input type="hidden" name="fecha" value={dia.fecha} />
          <input type="hidden" name="gravado" value={dia.gravado} />
          <input type="hidden" name="exento" value={dia.exento} />
          <input type="hidden" name="iva" value={dia.iva} />
          <input type="hidden" name="glosa" value={glosa} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? "Registrando…" : "Registrar"}
          </button>
        </form>
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      </td>
    </tr>
  );
}

const inicialBatch: FormState = {};

export default function ImportarVentasQupos({ centros }: { centros: Centro[] }) {
  const [analisis, analizarAction, analizando] = useActionState(analizarQupos, inicialAnalisis);
  const [batch, batchAction, registrandoTodo] = useActionState(registrarTodasImportadas, inicialBatch);
  const [centroSel, setCentroSel] = useState("");

  const centro = centros.find((c) => c.id === (analisis.centro_costo_id ?? centroSel));

  return (
    <div className="space-y-6">
      <form action={analizarAction} className="max-w-xl space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Negocio</span>
            <select
              name="centro_costo_id"
              required
              value={centroSel}
              onChange={(e) => setCentroSel(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            >
              <option value="" disabled>
                Elegí el negocio…
              </option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Excel de QuPOS</span>
            <input
              type="file"
              name="archivo"
              required
              accept=".xlsx"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
            />
          </label>
        </div>
        {analisis.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {analisis.error}
          </p>
        )}
        <button
          type="submit"
          disabled={analizando}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {analizando ? "Leyendo…" : "Analizar archivo"}
        </button>
      </form>

      {analisis.dias && centro && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">
              {centro.codigo} — {centro.nombre}: {analisis.dias.length}{" "}
              {analisis.dias.length === 1 ? "día" : "días"} de venta
            </h2>
            {analisis.dias.length > 1 && (
              <form action={batchAction}>
                <input type="hidden" name="centro_costo_id" value={centro.id} />
                <input
                  type="hidden"
                  name="dias"
                  value={JSON.stringify(
                    analisis.dias.map((d) => ({
                      fecha: d.fecha,
                      gravado: d.gravado,
                      exento: d.exento,
                      iva: d.iva,
                      tickets: d.tickets,
                    })),
                  )}
                />
                <button
                  type="submit"
                  disabled={registrandoTodo}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {registrandoTodo
                    ? "Registrando…"
                    : `Registrar y postear los ${analisis.dias.length} días`}
                </button>
              </form>
            )}
          </div>

          {batch.ok && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {batch.ok}{" "}
              <Link href="/ventas" className="font-medium underline hover:no-underline">
                Ver ventas
              </Link>
            </p>
          )}
          {batch.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {batch.error}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Gravado</th>
                  <th className="px-4 py-3 text-right font-medium">Exento</th>
                  <th className="px-4 py-3 text-right font-medium">IVA</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-center font-medium">Detalle</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {analisis.dias.map((d) => (
                  <FilaDia key={d.fecha} dia={d} centro={centro} />
                ))}
              </tbody>
            </table>
          </div>

          {!!analisis.ignoradas_sin_fecha && analisis.ignoradas_sin_fecha > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Se ignoró {analisis.ignoradas_sin_fecha === 1 ? "1 fila" : `${analisis.ignoradas_sin_fecha} filas`}{" "}
              sin fecha por ₡{fmt(analisis.ignorado_total ?? 0)} (QuPOS agrega una fila de total al
              final; no es una venta, no se cuenta).
            </p>
          )}
          <p className="text-xs text-neutral-500">
            El botón de arriba registra y postea todos los días de una. El{" "}
            <span className="font-medium">Registrar</span> de cada fila deja ese día en borrador
            para revisar y confirmar su asiento aparte.
          </p>
        </div>
      )}
    </div>
  );
}
