"use client";

import { useActionState, useMemo, useState } from "react";
import { crearVentaDia, type FormState } from "@/app/(app)/ventas/actions";

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

export default function VentaDiaForm({ centros, hoy }: { centros: Centro[]; hoy: string }) {
  const [state, formAction, pending] = useActionState(crearVentaDia, inicial);
  const [gravado, setGravado] = useState("");
  const [exento, setExento] = useState("");
  const [iva, setIva] = useState("");

  const total = useMemo(
    () => parse(gravado) + parse(exento) + parse(iva),
    [gravado, exento, iva],
  );
  const sugerirIva = () => setIva((Math.round(parse(gravado) * 0.13 * 100) / 100).toString());

  const campo =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-neutral-500";

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Venta gravada</span>
            <input
              type="number"
              name="gravado"
              min="0"
              step="any"
              value={gravado}
              onChange={(e) => setGravado(e.target.value)}
              placeholder="0.00"
              className={campo}
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Venta exenta</span>
            <input
              type="number"
              name="exento"
              min="0"
              step="any"
              value={exento}
              onChange={(e) => setExento(e.target.value)}
              placeholder="0.00"
              className={campo}
            />
          </label>
          <label className="block">
            <span className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
              IVA cobrado
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
              className={campo}
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-sm text-neutral-500">Total cobrado (a Caja)</span>
          <span className="text-lg font-semibold tabular-nums text-neutral-900">₡{fmt(total)}</span>
        </div>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Nota (opcional)</span>
        <input
          type="text"
          name="glosa"
          maxLength={300}
          placeholder="Ej: cierre de caja del día"
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
          disabled={pending || total <= 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <span className="text-sm text-neutral-500">El asiento se postea al confirmar.</span>
      </div>
    </form>
  );
}
