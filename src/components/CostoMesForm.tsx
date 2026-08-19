"use client";

import { useActionState } from "react";
import {
  calcularCostoMes,
  registrarCostoMes,
  type CalculoState,
  type FormState,
} from "@/app/(app)/costos/actions";

const inicialCalc: CalculoState = {};
const inicialReg: FormState = {};

const fmt = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostoMesForm({ mesActual }: { mesActual: string }) {
  const [calc, calcAction, calculando] = useActionState(calcularCostoMes, inicialCalc);
  const [reg, regAction, registrando] = useActionState(registrarCostoMes, inicialReg);

  const lineasJSON = JSON.stringify(
    (calc.centros ?? []).map((c) => ({ centro_costo_id: c.centro_id, monto: c.monto, sin_receta: c.sin_receta })),
  );
  const hayHuecos = (calc.centros ?? []).some((c) => c.sin_receta > 0);

  return (
    <div className="space-y-6">
      <form action={calcAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Mes</span>
          <input
            type="month"
            name="periodo"
            required
            defaultValue={calc.periodo ?? mesActual}
            className="mt-1 block rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </label>
        <button
          type="submit"
          disabled={calculando}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {calculando ? "Calculando…" : "Calcular costo"}
        </button>
        {calc.error && (
          <p className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {calc.error}
          </p>
        )}
      </form>

      {calc.centros && calc.centros.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            Costo de {calc.periodo} — consumo de materia prima por panadería
          </h2>

          <div className="max-w-xl overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Centro</th>
                  <th className="px-4 py-3 text-right font-medium">Costo</th>
                  <th className="px-4 py-3 text-right font-medium">Sin receta (u)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {calc.centros.map((c) => (
                  <tr key={c.centro_id}>
                    <td className="px-4 py-3 text-neutral-800">
                      {c.centro_codigo} — {c.centro_nombre}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(c.monto)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                      {c.sin_receta > 0 ? fmt(c.sin_receta) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-neutral-200 bg-neutral-50">
                <tr>
                  <td className="px-4 py-3 font-medium text-neutral-700">Total</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                    {fmt(calc.total ?? 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {hayHuecos && (
            <p className="max-w-xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Hay pan producido <b>sin receta</b> en el app de producción: ese pan no se costea, así que
              el costo sale <b>subestimado</b>. Se corrige completando esas recetas en el app.
            </p>
          )}
          {!!calc.sin_mapear?.length && (
            <p className="max-w-xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Sucursales de producción que no calzan con un centro (no se cuentan):{" "}
              {calc.sin_mapear.map((s) => `${s.sucursal} (₡${fmt(s.monto)})`).join(", ")}.
            </p>
          )}

          <form action={regAction}>
            <input type="hidden" name="periodo" value={calc.periodo} />
            <input type="hidden" name="lineas" value={lineasJSON} />
            <button
              type="submit"
              disabled={registrando}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {registrando ? "Guardando…" : "Registrar costo del mes"}
            </button>
            {reg.error && <p className="mt-2 text-sm text-red-600">{reg.error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
