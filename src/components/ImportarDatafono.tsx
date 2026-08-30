"use client";

import { useActionState } from "react";
import { analizarDatafono, registrarDatafono, type DatafonoState } from "@/app/(app)/tesoreria/datafono/actions";

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inicial: DatafonoState = {};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};

export default function ImportarDatafono({ centros }: { centros: Centro[] }) {
  const [analisis, analizarAction, analizando] = useActionState(analizarDatafono, inicial);
  const [registro, registrarAction, registrando] = useActionState(registrarDatafono, inicial);

  const l = analisis.liq;
  const dif = analisis.diferencia ?? 0;

  return (
    <div className="space-y-6">
      <form action={analizarAction} className="max-w-xl space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
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
            <span className="text-xs uppercase tracking-wide text-neutral-500">TXT de Credomatic</span>
            <input
              type="file"
              name="archivo"
              required
              accept=".txt"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-200"
            />
          </label>
        </div>
        {analisis.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{analisis.error}</p>
        )}
        <button
          type="submit"
          disabled={analizando}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          {analizando ? "Leyendo…" : "Analizar archivo"}
        </button>
      </form>

      {l && analisis.centro_costo_id && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            {analisis.centro_nombre} — {etiquetaMes(l.periodo)}
          </h2>

          {registro.ok ? (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{registro.ok}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Asiento que se va a postear
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cuenta</th>
                    <th className="px-4 py-2 text-right font-medium">Débito</th>
                    <th className="px-4 py-2 text-right font-medium">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  <Fila cuenta="Banco San José (neto depositado)" d={l.neto_banco} />
                  <Fila cuenta="Comisiones voucher Credomatic" d={l.comision} sub />
                  <Fila cuenta="Ajustes cobrados (servicios)" d={l.servicios} sub />
                  <Fila cuenta="Retención de IVA" d={l.ret_iva} />
                  <Fila cuenta="Retenciones Renta" d={l.ret_renta} />
                  <tr className="bg-emerald-50/40">
                    <td className="px-4 py-2 text-emerald-800">Datafono (cierra tarjetas del POS)</td>
                    <td />
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-800">{fmt(analisis.pos_tarjeta ?? 0)}</td>
                  </tr>
                  {dif !== 0 && (
                    <tr className="bg-amber-50/50">
                      <td className="px-4 py-2 text-amber-800">Diferencias voucher (POS vs procesador)</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-800">{dif < 0 ? fmt(-dif) : ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-800">{dif > 0 ? fmt(dif) : ""}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
                Facturación del procesador: <b>{fmt(l.facturacion)}</b>. Tarjetas del POS del mes:{" "}
                <b>{fmt(analisis.pos_tarjeta ?? 0)}</b>. La diferencia ({fmt(Math.abs(dif))}) va a Diferencias voucher para
                que el datafono cierre limpio.
                {(analisis.pos_tarjeta ?? 0) === 0 && (
                  <span className="text-amber-700">
                    {" "}
                    Ojo: no hay ventas con tarjeta registradas para ese negocio y mes — subí primero las ventas.
                  </span>
                )}
              </p>

              <form action={registrarAction} className="border-t border-neutral-200 px-4 py-3">
                <input type="hidden" name="centro_costo_id" value={analisis.centro_costo_id} />
                <input type="hidden" name="periodo" value={l.periodo} />
                <input type="hidden" name="facturacion" value={l.facturacion} />
                <input type="hidden" name="comision" value={l.comision} />
                <input type="hidden" name="servicios" value={l.servicios} />
                <input type="hidden" name="ret_iva" value={l.ret_iva} />
                <input type="hidden" name="ret_renta" value={l.ret_renta} />
                <input type="hidden" name="neto_banco" value={l.neto_banco} />
                <input type="hidden" name="pos_tarjeta" value={analisis.pos_tarjeta ?? 0} />
                {registro.error && <p className="mb-2 text-sm text-red-600">{registro.error}</p>}
                <button
                  type="submit"
                  disabled={registrando}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {registrando ? "Registrando…" : "Registrar y postear"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fila({ cuenta, d, sub }: { cuenta: string; d: number; sub?: boolean }) {
  return (
    <tr>
      <td className={`px-4 py-2 ${sub ? "pl-6 text-neutral-500" : "text-neutral-700"}`}>{cuenta}</td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{d > 0 ? fmt(d) : ""}</td>
      <td />
    </tr>
  );
}
