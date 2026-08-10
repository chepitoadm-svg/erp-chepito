"use client";

import { useActionState, useMemo, useState } from "react";
import { crearDesecho, type FormState } from "@/app/(app)/inventario/actions";

const inicial: FormState = {};

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}
interface Linea {
  descripcion: string;
  cantidad: string;
  costo: string;
}

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const filaVacia = (): Linea => ({ descripcion: "", cantidad: "", costo: "" });

export default function DesechoForm({ centros, hoy }: { centros: Centro[]; hoy: string }) {
  const [state, formAction, pending] = useActionState(crearDesecho, inicial);
  const [filas, setFilas] = useState<Linea[]>([filaVacia()]);

  const set = (i: number, campo: keyof Linea, val: string) =>
    setFilas((f) => f.map((r, j) => (j === i ? { ...r, [campo]: val } : r)));
  const agregar = () => setFilas((f) => [...f, filaVacia()]);
  const quitar = (i: number) => setFilas((f) => (f.length === 1 ? f : f.filter((_, j) => j !== i)));

  const lineas = useMemo(
    () =>
      filas
        .map((r) => ({
          descripcion: r.descripcion.trim(),
          cantidad: Number(r.cantidad),
          costo_unitario: Number(r.costo),
        }))
        .filter((r) => r.descripcion && r.cantidad > 0 && r.costo_unitario >= 0),
    [filas],
  );
  const total = useMemo(() => lineas.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0), [lineas]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Negocio</span>
          <select
            name="centro_costo_id"
            required
            defaultValue=""
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
          <span className="text-xs uppercase tracking-wide text-neutral-500">Fecha</span>
          <input
            type="date"
            name="fecha"
            required
            defaultValue={hoy}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Motivo</span>
          <select
            name="motivo"
            defaultValue="danado"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="danado">Dañado</option>
            <option value="vencido">Vencido</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filas.map((r, i) => {
              const val = Number(r.cantidad) > 0 && Number(r.costo) >= 0 ? Number(r.cantidad) * Number(r.costo) : 0;
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input
                      value={r.descripcion}
                      onChange={(e) => set(i, "descripcion", e.target.value)}
                      placeholder="Ej: Baguette"
                      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={r.cantidad}
                      onChange={(e) => set(i, "cantidad", e.target.value)}
                      className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-neutral-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={r.costo}
                      onChange={(e) => set(i, "costo", e.target.value)}
                      className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-neutral-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{fmt(val)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      className="text-neutral-400 hover:text-red-600"
                      aria-label="Quitar línea"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right text-neutral-500">
                Total del desecho
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={agregar}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        + Agregar producto
      </button>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Nota (opcional)</span>
        <input
          type="text"
          name="glosa"
          maxLength={300}
          placeholder="Ej: producto vencido del fin de semana"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
          disabled={pending || lineas.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <span className="text-sm text-neutral-500">Se guarda como borrador; el asiento se postea al confirmar.</span>
      </div>
    </form>
  );
}
