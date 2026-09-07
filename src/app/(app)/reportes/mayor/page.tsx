import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { mayorCuenta, flujoDetalleBancario, type FlujoDetalleLinea } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";
import SelectBuscable from "@/components/SelectBuscable";
import BotonVolver from "@/components/BotonVolver";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface MayorRow {
  fecha: string;
  asiento_id: string;
  asiento_numero: number | null;
  asiento_tipo: string;
  asiento_estado: string;
  glosa: string | null;
  centro_codigo: string | null;
  origen_tipo: string | null;
  origen_id: string | null;
  debito: number;
  credito: number;
  saldo: number;
}

// Pantalla de origen del asiento, para abrirlo y ver/modificar.
function hrefOrigen(m: MayorRow): string {
  if (m.origen_id) {
    if (m.origen_tipo === "gasto") return `/gastos/${m.origen_id}`;
    if (m.origen_tipo === "factura_compra") return `/compras/facturas/${m.origen_id}`;
  }
  return `/asientos/${m.asiento_id}`;
}

function FilaFlujo({ l, href }: { l: FlujoDetalleLinea; href: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{fechaCR(l.fecha)}</td>
      <td className="px-3 py-2 text-neutral-700">
        <Link href={href} className="underline decoration-dotted underline-offset-2 hover:text-neutral-900">
          {l.referencia && <span className="text-neutral-500">{l.referencia} · </span>}
          {l.descripcion || "—"}
        </Link>
      </td>
      <td className="px-3 py-2 text-neutral-800">{l.proveedor_nombre ?? <span className="text-neutral-300">—</span>}</td>
      <td className="px-3 py-2">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{l.tipo_label}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-neutral-900">{money(Math.abs(l.monto))}</td>
    </tr>
  );
}

export default async function MayorPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; desde?: string; hasta?: string; centro?: string; prorrateo?: string; anulados?: string; detalle?: string; agrupar?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const cuentas = await listarCuentasPosteables();
  const cuentaId = sp.cuenta || "";
  const detalleBanco = sp.detalle === "banco";
  const cuentaSel = cuentas.find((c) => c.id === cuentaId);
  const desde = sp.desde || "";
  const hasta = sp.hasta || "";
  const centro = sp.centro || "";
  const sinProrrateo = sp.prorrateo === "no";
  // Por defecto se ocultan los asientos anulados y sus reversiones (netean a
  // cero y confunden el saldo corrido). Se muestran con ?anulados=ver.
  const verAnulados = sp.anulados === "ver";

  // El prorrateo (y sus reversiones) se excluye en el servidor cuando sinProrrateo,
  // igual que en el Estado de Resultados, para que el detalle cuadre con la celda.
  const crudos = (cuentaId
    ? await mayorCuenta(cuentaId, desde || undefined, hasta || undefined, sinProrrateo, !verAnulados)
    : []) as MayorRow[];
  const filtrados = centro ? crudos.filter((m) => m.centro_codigo === centro) : crudos;
  // Al filtrar por centro el saldo acumulado del RPC ya no aplica: se recalcula.
  const hayFiltro = !!centro;
  let acc = 0;
  const movs = filtrados.map((m) => {
    acc += Number(m.debito) - Number(m.credito);
    return { ...m, saldoCalc: hayFiltro ? acc : Number(m.saldo) };
  });
  const totDeb = movs.reduce((s, m) => s + Number(m.debito), 0);
  const totCred = movs.reduce((s, m) => s + Number(m.credito), 0);

  // Resumen por centro de costo: cuánto suma cada uno en lo que se ve.
  const porCentroMap = new Map<string, number>();
  for (const m of movs) {
    const k = m.centro_codigo ?? "(sin centro)";
    porCentroMap.set(k, (porCentroMap.get(k) ?? 0) + (Number(m.debito) - Number(m.credito)));
  }
  const porCentro = [...porCentroMap.entries()]
    .map(([codigo, neto]) => ({ codigo, neto }))
    .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  const netoTotal = totDeb - totCred;
  // Vista agrupada por centro (para el drill-down): cada centro con su detalle
  // y subtotal. Solo cuando hay más de un centro y no se filtró por centro.
  const agrupar = movs.length > 0 && !centro && porCentro.length > 1;
  const grupos = porCentro.map((c) => ({
    centro: c.codigo,
    neto: c.neto,
    items: movs.filter((m) => (m.centro_codigo ?? "(sin centro)") === c.codigo),
  }));

  // Detalle del flujo: SOLO lo que tocó banco (los que suman el número del flujo),
  // con proveedor y tipo, agrupable por proveedor / tipo / centro.
  const agruparDet =
    sp.agrupar === "proveedor" || sp.agrupar === "tipo" || sp.agrupar === "centro" ? sp.agrupar : "";
  const flujoRows: FlujoDetalleLinea[] =
    detalleBanco && cuentaId && desde && hasta ? await flujoDetalleBancario(cuentaId, desde, hasta) : [];
  const flujoNeto = flujoRows.reduce((s, r) => s + r.monto, 0);
  const hrefOrigenDet = (l: { origen_tipo: string | null; origen_id: string | null; asiento_id: string }) =>
    l.origen_tipo === "gasto" && l.origen_id
      ? `/gastos/${l.origen_id}`
      : l.origen_tipo === "factura_compra" && l.origen_id
        ? `/compras/facturas/${l.origen_id}`
        : `/asientos/${l.asiento_id}`;
  const claveDet = (l: FlujoDetalleLinea): string =>
    agruparDet === "proveedor"
      ? l.proveedor_nombre ?? "(sin proveedor)"
      : agruparDet === "tipo"
        ? l.tipo_label
        : l.centro_codigo ?? "(sin centro)";
  const gruposDet = new Map<string, FlujoDetalleLinea[]>();
  if (agruparDet) for (const l of flujoRows) (gruposDet.get(claveDet(l)) ?? gruposDet.set(claveDet(l), []).get(claveDet(l))!).push(l);
  const gruposDetOrd = [...gruposDet.entries()]
    .map(([k, filas]) => ({ clave: k, filas, sub: filas.reduce((s, r) => s + r.monto, 0) }))
    .sort((a, b) => Math.abs(b.sub) - Math.abs(a.sub));
  // Enlace que conserva cuenta/fechas/detalle y cambia el agrupador.
  const hrefAgrupar = (val: string) => {
    const p = new URLSearchParams({ cuenta: cuentaId, detalle: "banco" });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (val) p.set("agrupar", val);
    return `/reportes/mayor?${p.toString()}`;
  };
  const hrefCentro = (cod: string) => {
    const p = new URLSearchParams({ cuenta: cuentaId });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (sinProrrateo) p.set("prorrateo", "no");
    if (cod !== "(sin centro)") p.set("centro", cod);
    return `/reportes/mayor?${p.toString()}`;
  };

  const sinCentro = new URLSearchParams({ cuenta: cuentaId });
  if (desde) sinCentro.set("desde", desde);
  if (hasta) sinCentro.set("hasta", hasta);

  return (
    <div>
      <BotonVolver fallback="/reportes" />
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Libro Mayor</h1>
      <p className="mb-4 text-sm text-neutral-500">Movimientos y saldo acumulado de una cuenta.</p>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Cuenta</label>
          <SelectBuscable
            name="cuenta"
            defaultValue={cuentaId}
            placeholder="Escribí para buscar la cuenta…"
            options={cuentas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
            className="mt-1 min-w-[280px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        {/* Conserva los filtros de drill-down al reenviar el form */}
        {centro && <input type="hidden" name="centro" value={centro} />}
        {sinProrrateo && <input type="hidden" name="prorrateo" value="no" />}
        {verAnulados && <input type="hidden" name="anulados" value="ver" />}
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Ver
        </button>
      </form>

      {!cuentaId ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Elegí una cuenta para ver su mayor.
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-neutral-700">
              {cuentaSel?.codigo} — {cuentaSel?.nombre}
            </h2>
            {centro && (
              <Link
                href={`/reportes/mayor?${sinCentro}${sinProrrateo ? "&prorrateo=no" : ""}`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
                title="Quitar el filtro de centro"
              >
                Centro: {centro} ✕
              </Link>
            )}
            {sinProrrateo && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">sin prorrateo</span>
            )}
            <Link
              href={(() => {
                const p = new URLSearchParams({ cuenta: cuentaId });
                if (desde) p.set("desde", desde);
                if (hasta) p.set("hasta", hasta);
                if (centro) p.set("centro", centro);
                if (sinProrrateo) p.set("prorrateo", "no");
                if (!verAnulados) p.set("anulados", "ver");
                return `/reportes/mayor?${p.toString()}`;
              })()}
              className="ml-auto rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50"
            >
              {verAnulados ? "ocultar anulados" : "ver anulados"}
            </Link>
          </div>

          {detalleBanco ? (
            /* Detalle del flujo: solo lo que tocó banco, con proveedor y tipo. */
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500">Agrupar por:</span>
                {[
                  { v: "", t: "Ninguno" },
                  { v: "proveedor", t: "Proveedor" },
                  { v: "tipo", t: "Tipo" },
                  { v: "centro", t: "Centro" },
                ].map((o) => (
                  <Link
                    key={o.v}
                    href={hrefAgrupar(o.v)}
                    className={`rounded-full px-2.5 py-1 ${agruparDet === o.v ? "bg-neutral-900 text-white" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
                  >
                    {o.t}
                  </Link>
                ))}
                <span className="ml-auto rounded-md bg-neutral-100 px-3 py-1 font-semibold text-neutral-900">
                  Total: {money(Math.abs(flujoNeto))}{" "}
                  <span className="font-normal text-neutral-400">({flujoRows.length})</span>
                </span>
              </div>

              {flujoRows.length === 0 ? (
                <p className="rounded-lg border border-neutral-200 bg-white px-3 py-6 text-center text-sm text-neutral-400">
                  Sin movimientos que hayan tocado el banco en el rango.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Detalle (banco)</th>
                        <th className="px-3 py-2 font-medium">Proveedor</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    {agruparDet ? (
                      gruposDetOrd.map((g) => (
                        <tbody key={g.clave} className="divide-y divide-neutral-100 border-t border-neutral-200">
                          <tr className="bg-neutral-50/70">
                            <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-neutral-800">
                              {g.clave} <span className="font-normal text-neutral-400">({g.filas.length})</span>
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-neutral-900">
                              {money(Math.abs(g.sub))}
                            </td>
                          </tr>
                          {g.filas.map((l, i) => (
                            <FilaFlujo key={i} l={l} href={hrefOrigenDet(l)} />
                          ))}
                        </tbody>
                      ))
                    ) : (
                      <tbody className="divide-y divide-neutral-100">
                        {flujoRows.map((l, i) => (
                          <FilaFlujo key={i} l={l} href={hrefOrigenDet(l)} />
                        ))}
                      </tbody>
                    )}
                  </table>
                </div>
              )}
            </div>
          ) : agrupar ? (
            /* Vista agrupada por centro de costo (verde), con subtotal de cada uno. */
            <div className="space-y-3">
              {grupos.map((g) => (
                <div key={g.centro} className="overflow-hidden rounded-lg border border-green-200 bg-green-50/40">
                  <div className="flex items-center justify-between border-b border-green-200 bg-green-50 px-3 py-2">
                    <Link href={hrefCentro(g.centro)} className="text-sm font-semibold text-green-800 underline decoration-dotted underline-offset-2 hover:no-underline">
                      {g.centro}
                    </Link>
                    <span className="text-sm font-semibold tabular-nums text-green-800">{money(g.neto)}</span>
                  </div>
                  <ul className="divide-y divide-green-100">
                    {g.items.map((m, i) => {
                      const anulado = m.asiento_estado === "anulado";
                      const monto = Number(m.debito) - Number(m.credito);
                      return (
                        <li key={i} className={`flex items-start gap-2 px-3 py-1.5 text-sm ${anulado ? "text-neutral-400" : "text-neutral-700"}`}>
                          <span className="mt-0.5 text-green-600">•</span>
                          <span className="w-24 shrink-0 text-neutral-500">{fechaCR(m.fecha)}</span>
                          <Link href={hrefOrigen(m)} className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-neutral-900" title="Abrir el origen">
                            {m.asiento_numero ? `${m.asiento_tipo.slice(0, 3).toUpperCase()}-${m.asiento_numero}` : m.asiento_tipo}
                          </Link>
                          <span className="flex-1 truncate">
                            {m.glosa}
                            {anulado && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">anulado</span>}
                          </span>
                          <span className="shrink-0 tabular-nums">{money(monto)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-900">
                <span>Total ({movs.length} movimiento{movs.length !== 1 ? "s" : ""})</span>
                <span className="tabular-nums">{money(netoTotal)}</span>
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Asiento</th>
                  <th className="px-3 py-2 text-left font-medium">Glosa</th>
                  <th className="px-3 py-2 text-right font-medium">Débito</th>
                  <th className="px-3 py-2 text-right font-medium">Crédito</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                      Sin movimientos confirmados en el rango.
                    </td>
                  </tr>
                )}
                {movs.map((m, i) => {
                  const anulado = m.asiento_estado === "anulado";
                  return (
                  <tr key={i} className={`border-t border-neutral-100 ${anulado ? "text-neutral-400" : ""}`}>
                    <td className="px-3 py-1.5">{fechaCR(m.fecha)}</td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={hrefOrigen(m)}
                        className={`underline decoration-dotted underline-offset-2 hover:text-neutral-900 ${anulado ? "" : "text-neutral-700"}`}
                        title="Abrir el origen (gasto/factura/asiento)"
                      >
                        {m.asiento_numero ? `${m.asiento_tipo.slice(0, 3).toUpperCase()}-${m.asiento_numero}` : m.asiento_tipo}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {m.glosa}
                      {anulado && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">anulado</span>}
                      {m.centro_codigo ? <span className="ml-1 text-xs text-neutral-400">[{m.centro_codigo}]</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                      {Number(m.debito) ? money(Number(m.debito)) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                      {Number(m.credito) ? money(Number(m.credito)) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-neutral-800">
                      {money(m.saldoCalc)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              {movs.length > 0 && (
                <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-700">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      {movs.length} movimiento{movs.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totDeb)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totCred)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totDeb - totCred)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
