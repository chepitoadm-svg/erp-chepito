"use client";

import { Fragment, useState, useTransition } from "react";
import type { CentroFlujo, FlujoCategoria, FlujoLinea, FlujoCentroDetalleFila } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaCorta = (f: string) => {
  const p = (f || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : f;
};

type Detalle = (
  desde: string,
  hasta: string,
  centroCodigo: string,
  cuentaCodigo: string,
) => Promise<FlujoCentroDetalleFila[]>;

// Una línea (cuenta) dentro de un lado: se puede tocar para abrir el detalle.
function LineaRow({
  linea,
  centroCodigo,
  desde,
  hasta,
  onDetalle,
}: {
  linea: FlujoLinea;
  centroCodigo: string;
  desde: string;
  hasta: string;
  onDetalle: Detalle;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<FlujoCentroDetalleFila[] | null>(null);
  const [cargando, startTransition] = useTransition();
  // Las líneas de reparto (Taller/General) no tienen movimientos propios que abrir.
  const esReparto = linea.cuenta_codigo.startsWith("PROR-");

  const toggle = () => {
    if (esReparto) return;
    if (!abierto && filas === null) {
      startTransition(async () => {
        try {
          const d = await onDetalle(desde, hasta, centroCodigo, linea.cuenta_codigo);
          setFilas(d);
        } catch {
          setFilas([]);
        }
      });
    }
    setAbierto((v) => !v);
  };

  return (
    <>
      <tr
        onClick={toggle}
        className={esReparto ? "" : "cursor-pointer hover:bg-neutral-100/70"}
        title={esReparto ? undefined : "Tocar para ver el detalle"}
      >
        <td className="py-0.5 pl-6 pr-3 text-neutral-600">
          {!esReparto && <span className="mr-1 inline-block w-3 text-neutral-400">{abierto ? "▾" : "▸"}</span>}
          {linea.cuenta_nombre}
        </td>
        <td className="px-3 py-0.5 text-right tabular-nums text-neutral-500">{money(linea.monto)}</td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={2} className="bg-neutral-50 px-2 pb-2 pt-0.5">
            {cargando && filas === null ? (
              <p className="px-4 py-2 text-xs text-neutral-400">Cargando…</p>
            ) : filas && filas.length > 0 ? (
              <table className="w-full text-xs">
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className="border-b border-neutral-100 last:border-0">
                      <td className="whitespace-nowrap py-0.5 pl-8 pr-2 tabular-nums text-neutral-400">
                        {fechaCorta(f.fecha)}
                      </td>
                      <td className="py-0.5 pr-2 text-neutral-600">{f.concepto}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-neutral-500">{money(f.monto)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-neutral-200">
                    <td className="py-0.5 pl-8 pr-2 text-[11px] font-medium text-neutral-500" colSpan={2}>
                      {filas.length} movimiento{filas.length === 1 ? "" : "s"}
                    </td>
                    <td className="py-0.5 pr-3 text-right text-[11px] font-semibold tabular-nums text-neutral-600">
                      {money(filas.reduce((s, x) => s + x.monto, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-2 text-xs text-neutral-400">Sin detalle para esta línea.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Lado({
  titulo,
  cats,
  signo,
  centroCodigo,
  desde,
  hasta,
  onDetalle,
}: {
  titulo: string;
  cats: FlujoCategoria[];
  signo: "+" | "-";
  centroCodigo: string;
  desde: string;
  hasta: string;
  onDetalle: Detalle;
}) {
  const total = cats.reduce((s, c) => s + c.total, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className={`flex items-center justify-between px-3 py-1.5 text-sm font-semibold ${
          signo === "+" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
        }`}
      >
        <span>{titulo}</span>
        <span className="tabular-nums">
          {signo} {money(total)}
        </span>
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
                  <LineaRow
                    key={c.categoria + l.cuenta_codigo}
                    linea={l}
                    centroCodigo={centroCodigo}
                    desde={desde}
                    hasta={hasta}
                    onDetalle={onDetalle}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FlujoPorCentroPanel({
  centros,
  conReparto = false,
  desde,
  hasta,
  onDetalle,
}: {
  centros: CentroFlujo[];
  conReparto?: boolean;
  desde: string;
  hasta: string;
  onDetalle: Detalle;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const hayAviso = centros.some((c) => c.avisoSinReparto);

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
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {c.centro_nombre}
                      {c.avisoSinReparto && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          sin repartir
                        </span>
                      )}
                    </td>
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
                        <p className="mb-2 text-xs text-neutral-500">Tocá una línea para ver sus movimientos.</p>
                        <div className="grid gap-3 lg:grid-cols-2">
                          <Lado titulo={`Entró a ${c.centro_nombre}`} cats={c.entradas} signo="+" centroCodigo={c.centro_codigo} desde={desde} hasta={hasta} onDetalle={onDetalle} />
                          <Lado titulo={`Salió de ${c.centro_nombre}`} cats={c.salidas} signo="-" centroCodigo={c.centro_codigo} desde={desde} hasta={hasta} onDetalle={onDetalle} />
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
      {conReparto ? (
        <p className="text-xs text-neutral-500">
          El <b>Neto</b> positivo = ese negocio generó caja; negativo = consumió. <b>Con reparto:</b> el
          flujo de <b>Taller</b> y <b>General</b> ya está repartido entre las panaderías con el mismo % del
          prorrateo del mes (aparece como <i>&quot;Centros de apoyo&quot;</i> en el detalle de cada una), así cada
          una carga su parte justa. Las ventas con tarjeta se cuentan a la panadería que las vendió.
          <b> Casa</b> (gasto personal) y <b>Sin negocio</b> (préstamos, IVA, traslados) no se reparten.
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          El <b>Neto</b> positivo = ese negocio generó caja; negativo = consumió. Las ventas con tarjeta se
          cuentan a la panadería que las vendió. <b>Sin negocio</b> = préstamos, IVA y traslados entre
          cuentas (no son de una panadería). Taller y General son centros de apoyo: no venden, solo
          consumen (los pagan las sucursales). Con el botón <b>&quot;Con reparto&quot;</b> se reparten entre las
          panaderías.
        </p>
      )}
      {hayAviso && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Hay un centro de apoyo marcado <b>&quot;sin repartir&quot;</b>: este mes todavía no se corrió su
          prorrateo, así que su caja no se pudo repartir. Corré el prorrateo del mes en Configuración →
          Prorrateo para que quede cargado a las panaderías.
        </p>
      )}
    </div>
  );
}
