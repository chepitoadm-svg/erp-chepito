"use client";

import { Fragment, useState } from "react";
import type { CentroFlujo, FlujoCategoria } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Lado({ titulo, cats, signo }: { titulo: string; cats: FlujoCategoria[]; signo: "+" | "-" }) {
  const total = cats.reduce((s, c) => s + c.total, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className={`flex items-center justify-between px-3 py-1.5 text-sm font-semibold ${
          signo === "+" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
        }`}
      >
        <span>{titulo}</span>
        <span className="tabular-nums">{signo} {money(total)}</span>
      </div>
      {cats.length === 0 ? (
        <p className="px-3 py-3 text-center text-xs text-neutral-400">Sin movimientos.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {cats.map((c) => (
              <Fragment key={c.categoria}>
                <tr className="bg-neutral-50/60">
                  <td className="px-3 py-1 font-medium text-neutral-800">{c.categoria}</td>
                  <td className="px-3 py-1 text-right font-medium tabular-nums text-neutral-800">{money(c.total)}</td>
                </tr>
                {c.lineas.map((l) => (
                  <tr key={c.categoria + l.cuenta_codigo}>
                    <td className="py-0.5 pl-6 pr-3 text-neutral-600">{l.cuenta_nombre}</td>
                    <td className="px-3 py-0.5 text-right tabular-nums text-neutral-500">{money(l.monto)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FlujoPorCentroPanel({ centros }: { centros: CentroFlujo[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (centros.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
        No hay movimientos de caja este mes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 text-right font-medium">Entró</th>
              <th className="px-4 py-3 text-right font-medium">Salió</th>
              <th className="px-4 py-3 text-right font-medium">Neto del mes</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {centros.map((c) => {
              const abiertoAqui = abierto === c.centro_codigo;
              return (
                <Fragment key={c.centro_codigo}>
                  <tr className={abiertoAqui ? "bg-neutral-50" : ""}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.centro_nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">{money(c.entro)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{money(c.salio)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${c.neto >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {c.neto < 0 ? `(${money(-c.neto)})` : money(c.neto)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setAbierto(abiertoAqui ? null : c.centro_codigo)}
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
                      >
                        {abiertoAqui ? "Ocultar" : "Ver detalle"}
                      </button>
                    </td>
                  </tr>
                  {abiertoAqui && (
                    <tr>
                      <td colSpan={5} className="bg-neutral-50 px-4 py-3">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <Lado titulo={`Entró a ${c.centro_nombre}`} cats={c.entradas} signo="+" />
                          <Lado titulo={`Salió de ${c.centro_nombre}`} cats={c.salidas} signo="-" />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        El <b>Neto</b> positivo = ese negocio generó caja; negativo = consumió. Las ventas con tarjeta se
        cuentan a la panadería que las vendió. <b>Sin negocio</b> = préstamos, IVA y traslados entre
        cuentas (no son de una panadería). Taller y General son centros de apoyo: no venden, solo
        consumen (los pagan las sucursales).
      </p>
    </div>
  );
}
