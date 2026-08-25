import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { flujoCaja, compromisos, type FlujoCategoria } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimo = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  return { desde, hasta };
}
function mover(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function etiqueta(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export default async function FlujoCajaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : "2026-07";
  const { desde, hasta } = rango(mes);

  const [flujo, comp, cuentas] = await Promise.all([
    flujoCaja(desde, hasta),
    compromisos(hasta),
    listarCuentasPosteables(),
  ]);
  const codToId = new Map(cuentas.map((c: { id: string; codigo: string }) => [c.codigo, c.id]));
  const hrefMayor = (cod: string) => {
    const id = codToId.get(cod);
    return id ? `/reportes/mayor?cuenta=${id}&desde=${desde}&hasta=${hasta}&detalle=banco` : null;
  };
  // Para saldos acumulados (compromisos): sin fecha desde, para que el saldo del
  // Mayor termine en el mismo saldo que muestra el compromiso.
  const hrefMayorSaldo = (cod: string) => {
    const id = codToId.get(cod);
    return id ? `/reportes/mayor?cuenta=${id}&hasta=${hasta}` : null;
  };

  const neto = flujo.total_entradas - flujo.total_salidas;

  const Seccion = ({ titulo, cats, signo }: { titulo: string; cats: FlujoCategoria[]; signo: "+" | "-" }) => (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className={`flex items-center justify-between px-4 py-2 text-sm font-semibold ${
          signo === "+" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
        }`}
      >
        <span>{titulo}</span>
        <span className="tabular-nums">
          {signo} {money(cats.reduce((s, c) => s + c.total, 0))}
        </span>
      </div>
      {cats.length === 0 ? (
        <p className="px-4 py-4 text-center text-sm text-neutral-400">Sin movimientos.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {cats.map((c) => (
              <Fragment key={c.categoria}>
                <tr className="bg-neutral-50/60">
                  <td className="px-4 py-1.5 font-medium text-neutral-800">{c.categoria}</td>
                  <td className="px-4 py-1.5 text-right font-medium tabular-nums text-neutral-800">{money(c.total)}</td>
                </tr>
                {c.lineas.map((l) => {
                  const href = hrefMayor(l.cuenta_codigo);
                  return (
                    <tr key={c.categoria + l.cuenta_codigo}>
                      <td className="py-1 pl-8 pr-4 text-neutral-600">
                        {href ? (
                          <Link href={href} className="underline decoration-dotted underline-offset-2 hover:text-neutral-900">
                            {l.cuenta_nombre}
                          </Link>
                        ) : (
                          l.cuenta_nombre
                        )}
                      </td>
                      <td className="px-4 py-1 text-right tabular-nums text-neutral-500">{money(l.monto)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Flujo de caja</h1>
      <p className="mb-4 text-sm text-neutral-500">De dónde entra y en qué se va la plata de caja y bancos, mes a mes.</p>

      {/* Selector de mes */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/reportes/flujo?mes=${mover(mes, -1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          ← {etiqueta(mover(mes, -1))}
        </Link>
        <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium capitalize text-white">{etiqueta(mes)}</span>
        <Link
          href={`/reportes/flujo?mes=${mover(mes, 1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          {etiqueta(mover(mes, 1))} →
        </Link>
      </div>

      {/* Resumen */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Saldo inicial</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(flujo.saldo_inicial)}</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="text-xs text-green-700">Entró</div>
          <div className="text-base font-semibold tabular-nums text-green-800">{money(flujo.total_entradas)}</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">Salió</div>
          <div className="text-base font-semibold tabular-nums text-red-800">{money(flujo.total_salidas)}</div>
        </div>
        <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3">
          <div className="text-xs text-neutral-500">Saldo final</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(flujo.saldo_final)}</div>
          <div className={`text-xs tabular-nums ${neto < 0 ? "text-red-600" : "text-green-700"}`}>
            {neto < 0 ? "▼" : "▲"} {money(Math.abs(neto))} en el mes
          </div>
        </div>
      </div>

      {/* ¿Cuánto me queda de verdad? — disponible vs lo que se debe al cierre */}
      <div className="mb-5 overflow-hidden rounded-lg border border-neutral-300 bg-white">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
          ¿Cuánto me queda de verdad? — al {hasta}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-500">Tengo (caja + bancos)</div>
            <div className="text-lg font-semibold tabular-nums text-neutral-900">{money(comp.disponible)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Debo (compromisos)</div>
            <div className="text-lg font-semibold tabular-nums text-red-700">{money(comp.total_debo)}</div>
          </div>
          <div className={`rounded-md p-2 ${comp.neto < 0 ? "bg-red-50" : "bg-green-50"}`}>
            <div className="text-xs text-neutral-500">Me quedaría si pago todo</div>
            <div className={`text-lg font-semibold tabular-nums ${comp.neto < 0 ? "text-red-700" : "text-green-800"}`}>
              {money(comp.neto)}
            </div>
          </div>
        </div>
        {comp.categorias.length > 0 && (
          <table className="w-full border-t border-neutral-100 text-sm">
            <tbody className="divide-y divide-neutral-100">
              {comp.categorias.map((c) => (
                <Fragment key={c.categoria}>
                  <tr className="bg-neutral-50/60">
                    <td className="px-4 py-1.5 font-medium text-neutral-800">{c.categoria}</td>
                    <td className="px-4 py-1.5 text-right font-medium tabular-nums text-neutral-800">{money(c.total)}</td>
                  </tr>
                  {c.lineas.map((l) => {
                    const href = hrefMayorSaldo(l.cuenta_codigo);
                    return (
                      <tr key={c.categoria + l.cuenta_codigo}>
                        <td className="py-1 pl-8 pr-4 text-neutral-600">
                          {href ? (
                            <Link href={href} className="underline decoration-dotted underline-offset-2 hover:text-neutral-900">
                              {l.cuenta_nombre}
                            </Link>
                          ) : (
                            l.cuenta_nombre
                          )}
                        </td>
                        <td className="px-4 py-1 text-right tabular-nums text-neutral-500">{money(l.saldo)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          El banco puede verse lleno, pero esto es lo que <b>de verdad</b> te queda después de pagar proveedores e
          impuestos. {comp.neto < 0 && <b className="text-red-700">Cuidado: no alcanza para cubrir lo que debés.</b>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Entradas (de dónde entra)" cats={flujo.entradas} signo="+" />
        <Seccion titulo="Salidas (en qué se va)" cats={flujo.salidas} signo="-" />
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Saldo inicial {money(flujo.saldo_inicial)} + entradas {money(flujo.total_entradas)} − salidas{" "}
        {money(flujo.total_salidas)} = saldo final <b>{money(flujo.saldo_final)}</b> (calza con caja+bancos). Tocá una
        cuenta para ver el detalle en el Mayor. Ojo: las compras a crédito que aún no pagás no salen acá — están en{" "}
        <Link href="/compras/cxp" className="underline hover:no-underline">
          Cuentas por pagar
        </Link>
        .
      </p>
    </div>
  );
}
