"use client";

import Link from "next/link";
import { Fragment, useRef, useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importarRetiros,
  importarRetirosDep,
  marcarRetiro,
  deshacerRetiro,
  ingresarRetiroGasto,
  pagarFacturaDesdeRetiro,
  pagarPlanillaDesdeRetiro,
  agregarRetiroManual,
  borrarRetiro,
} from "@/app/(app)/cierre/actions";
import type { RetiroCaja, CxpPendiente, PlanillaPendiente } from "@/lib/data/cierre";

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
}

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const CHIP: Record<string, string> = {
  ingresado: "bg-green-50 text-green-700 border-green-200",
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  na: "bg-neutral-100 text-neutral-500 border-neutral-200",
};
const CHIP_TXT: Record<string, string> = { ingresado: "Ingresado", pendiente: "Pendiente", na: "N/A" };

const inputCls = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

export default function RetirosCajaPanel({
  retiros,
  centroId,
  centroCodigo,
  anio,
  mes,
  cuentasGasto,
  cuentasCaja,
  cxp,
  centros,
  cuentasIngreso,
  planillas,
  esDepositos = false,
  permiteManual = false,
}: {
  retiros: RetiroCaja[];
  centroId: string;
  centroCodigo: string;
  anio: number;
  mes: number;
  cuentasGasto: Cuenta[];
  cuentasCaja: Cuenta[];
  cxp: CxpPendiente[];
  centros: Cuenta[];
  cuentasIngreso: Cuenta[];
  planillas: PlanillaPendiente[];
  esDepositos?: boolean;
  permiteManual?: boolean;
}) {
  const centroDefault = centroId || centros[0]?.id || "";
  const acceptImport = esDepositos ? ".pdf" : ".xlsx,.xls";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const cajaDefault = cuentasCaja.find((c) => c.codigo.startsWith("11-10-10-01"))?.id ?? cuentasCaja[0]?.id ?? "";

  // Un solo formulario abierto a la vez: {id, modo}.
  const [open, setOpen] = useState<{ id: string; modo: "gasto" | "pago" | "planilla" } | null>(null);
  // Gasto
  const [cuentaGasto, setCuentaGasto] = useState("");
  const [centroGasto, setCentroGasto] = useState(centroDefault);
  const [caja, setCaja] = useState(cajaDefault);
  const [iva, setIva] = useState(0);
  // Pago de factura
  const [prov, setProv] = useState("");
  const [cxpSel, setCxpSel] = useState("");
  const [montoPago, setMontoPago] = useState(0);
  const [cajaPago, setCajaPago] = useState(cajaDefault);
  const [saldar, setSaldar] = useState(false);
  const difDefault = cuentasIngreso.find((c) => c.codigo.startsWith("43-10-04"))?.id ?? cuentasIngreso[0]?.id ?? "";
  const [cuentaDif, setCuentaDif] = useState(difDefault);
  const [centroDif, setCentroDif] = useState(centroDefault);
  // Pago de planilla
  const [planSel, setPlanSel] = useState("");
  const [montoPlan, setMontoPlan] = useState(0);
  const [cajaPlan, setCajaPlan] = useState(cajaDefault);
  // Alta manual (salidas de ventas externas)
  const [mFecha, setMFecha] = useState(`${anio}-${String(mes).padStart(2, "0")}-01`);
  const [mDesc, setMDesc] = useState("");
  const [mMonto, setMMonto] = useState("");

  const proveedores = useMemo(() => {
    const m = new Map<string, string>();
    cxp.forEach((c) => m.set(c.proveedor_id, c.proveedor_nombre));
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [cxp]);
  const cxpDeProv = useMemo(() => cxp.filter((c) => c.proveedor_id === prov), [cxp, prov]);
  const cxpSaldoSel = cxp.find((c) => c.id === cxpSel)?.saldo ?? 0;
  const difPago = Math.round((cxpSaldoSel - montoPago) * 100) / 100; // >0 = salió menos que la factura

  const run = (fn: () => Promise<{ error?: string; ok?: string }>) =>
    start(async () => {
      setMsg({});
      const r = await fn();
      setMsg(r);
      if (!r.error) router.refresh();
    });

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("anio", String(anio));
    fd.set("mes", String(mes));
    fd.set("archivo", f);
    if (esDepositos) {
      run(() => importarRetirosDep(fd));
    } else {
      fd.set("centro_id", centroId);
      run(() => importarRetiros(fd));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const abrirGasto = (id: string) => {
    setOpen({ id, modo: "gasto" });
    setCuentaGasto("");
    setCentroGasto(centroDefault);
    setCaja(cajaDefault);
    setIva(0);
    setMsg({});
  };
  const abrirPago = (id: string, monto: number) => {
    setOpen({ id, modo: "pago" });
    setProv("");
    setCxpSel("");
    setMontoPago(monto);
    setCajaPago(cajaDefault);
    setSaldar(false);
    setCuentaDif(difDefault);
    setCentroDif(centroDefault);
    setMsg({});
  };
  const elegirCxp = (id: string, retiroMonto: number) => {
    setCxpSel(id);
    const c = cxp.find((x) => x.id === id);
    if (c) setMontoPago(Math.min(retiroMonto, c.saldo));
  };
  const abrirPlanilla = (id: string, monto: number) => {
    setOpen({ id, modo: "planilla" });
    setPlanSel("");
    setMontoPlan(monto);
    setCajaPlan(cajaDefault);
    setMsg({});
  };
  const elegirPlan = (id: string, retiroMonto: number) => {
    setPlanSel(id);
    const p = planillas.find((x) => x.id === id);
    if (p) setMontoPlan(Math.min(retiroMonto, p.saldo));
  };

  const ingresarGasto = (id: string) =>
    start(async () => {
      setMsg({});
      const r = await ingresarRetiroGasto(id, cuentaGasto, caja, iva, centroGasto);
      setMsg(r.error ? { error: r.error } : { ok: r.numero ? `Posteado — asiento #${r.numero}.` : "Posteado." });
      if (!r.error) {
        setOpen(null);
        router.refresh();
      }
    });

  const pagarFactura = (id: string) =>
    start(async () => {
      setMsg({});
      const r = await pagarFacturaDesdeRetiro(id, prov, cxpSel, cajaPago, montoPago, saldar, cuentaDif, centroDif);
      setMsg(r.error ? { error: r.error } : { ok: r.numero ? `Factura pagada — asiento #${r.numero}.` : "Pagado." });
      if (!r.error) {
        setOpen(null);
        router.refresh();
      }
    });

  const pagarPlanilla = (id: string) =>
    start(async () => {
      setMsg({});
      const r = await pagarPlanillaDesdeRetiro(id, planSel, cajaPlan, montoPlan);
      setMsg(r.error ? { error: r.error } : { ok: r.numero ? `Planilla pagada — asiento #${r.numero}.` : "Pagado." });
      if (!r.error) {
        setOpen(null);
        router.refresh();
      }
    });

  const agregarManual = () => {
    const monto = Math.max(0, Number(mMonto.replace(/[^\d.-]/g, "")) || 0);
    if (!mFecha || !(monto > 0)) {
      setMsg({ error: "Poné fecha y monto." });
      return;
    }
    start(async () => {
      setMsg({});
      const r = await agregarRetiroManual(mFecha, mDesc, monto, "venta_ext");
      if (r.error) setMsg({ error: r.error });
      else {
        setMDesc("");
        setMMonto("");
        router.refresh();
      }
    });
  };
  const eliminar = (id: string) => run(() => borrarRetiro(id));

  const total = retiros.filter((r) => r.estado !== "na").length;
  const ingresados = retiros.filter((r) => r.estado === "ingresado").length;
  const pendientes = retiros.filter((r) => r.estado === "pendiente").length;
  const montoPend = retiros.filter((r) => r.estado === "pendiente").reduce((s, r) => s + r.monto, 0);

  return (
    <div>
      <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-600">
            {retiros.length === 0 ? (
              permiteManual ? (
                <>Agregá abajo las salidas de la plata de ventas externas y marcá cuáles ya están ingresadas.</>
              ) : esDepositos ? (
                <>Subí el PDF del reporte mensual de retiros/depósitos para empezar a cotejar.</>
              ) : (
                <>Subí el Excel de retiros de QuPOS de esta caja para empezar a cotejar.</>
              )
            ) : (
              <>
                <span className="font-semibold text-neutral-900">
                  {ingresados} de {total} ingresados
                </span>
                {pendientes > 0 && <span className="text-amber-600"> · faltan {pendientes} ({money(montoPend)})</span>}
              </>
            )}
          </div>
          {!permiteManual &&
            (retiros.length === 0 ? (
              <label className="cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                {pending ? "Procesando…" : esDepositos ? "Importar PDF de retiros" : "Importar Excel de retiros"}
                <input ref={fileRef} type="file" accept={acceptImport} onChange={onImport} disabled={pending} className="hidden" />
              </label>
            ) : (
              <label className="cursor-pointer text-xs text-neutral-500 underline hover:text-neutral-900">
                {pending ? "Procesando…" : `Actualizar / re-importar ${esDepositos ? "PDF" : "Excel"}`}
                <input ref={fileRef} type="file" accept={acceptImport} onChange={onImport} disabled={pending} className="hidden" />
              </label>
            ))}
        </div>

        {permiteManual && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="date" value={mFecha} onChange={(e) => setMFecha(e.target.value)} className={inputCls} />
            <input
              value={mDesc}
              onChange={(e) => setMDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarManual()}
              placeholder="Concepto (compra, depósito, quincena…)"
              className={`${inputCls} min-w-[240px] flex-1`}
            />
            <input
              value={mMonto}
              onChange={(e) => setMMonto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarManual()}
              inputMode="decimal"
              placeholder="Monto"
              className={`${inputCls} w-32 text-right tabular-nums`}
            />
            <button onClick={agregarManual} disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
              + Agregar salida
            </button>
          </div>
        )}
      </div>

      {msg.error && <p className="mb-3 text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="mb-3 text-sm text-green-700">{msg.ok}</p>}

      {retiros.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          {permiteManual
            ? "Todavía no hay salidas este mes."
            : `Todavía no hay retiros importados ${esDepositos ? "" : `para ${centroCodigo} `}en este mes.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Folio</th>
                <th className="px-4 py-3 text-right font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {retiros.map((r) => (
                <Fragment key={r.id}>
                  <tr className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{fechaCorta(r.fecha)}</td>
                    <td className="px-4 py-3 text-neutral-500">{r.control_caja ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">{money(r.monto)}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      <div className="max-w-xs">{r.motivo ?? "—"}</div>
                      {r.cajero && <div className="text-xs text-neutral-400">{r.cajero}</div>}
                      {r.estado === "ingresado" && r.asiento_id && (
                        <Link
                          href={`/asientos/${r.asiento_id}?volver=${encodeURIComponent(`/cierre/${anio}/${mes}/retiros/${centroCodigo}`)}&volverLabel=Retiros`}
                          className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
                        >
                          ↳ {r.mov_desc ?? "movimiento"} · asiento #{r.asiento_numero}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${CHIP[r.estado]}`}>{CHIP_TXT[r.estado]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1">
                        {r.estado === "pendiente" && (
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              onClick={() => (open?.id === r.id && open.modo === "pago" ? setOpen(null) : abrirPago(r.id, r.monto))}
                              disabled={pending}
                              className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-800"
                            >
                              {open?.id === r.id && open.modo === "pago" ? "Cancelar" : "Pagar factura"}
                            </button>
                            <button
                              onClick={() => (open?.id === r.id && open.modo === "planilla" ? setOpen(null) : abrirPlanilla(r.id, r.monto))}
                              disabled={pending}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                            >
                              {open?.id === r.id && open.modo === "planilla" ? "Cancelar" : "Pagar planilla"}
                            </button>
                            <button
                              onClick={() => (open?.id === r.id && open.modo === "gasto" ? setOpen(null) : abrirGasto(r.id))}
                              disabled={pending}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50"
                            >
                              {open?.id === r.id && open.modo === "gasto" ? "Cancelar" : "Ingresar gasto"}
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          {r.estado === "ingresado" && (
                            <button
                              onClick={() => {
                                if (confirm("Deshacer revierte el asiento y restaura los saldos (anula el pago/gasto generado). ¿Continuar?"))
                                  run(() => deshacerRetiro(r.id));
                              }}
                              disabled={pending}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                            >
                              Deshacer
                            </button>
                          )}
                          {r.estado === "pendiente" && (
                            <button onClick={() => run(() => marcarRetiro(r.id, "na"))} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50">
                              N/A
                            </button>
                          )}
                          {permiteManual && r.estado !== "ingresado" && (
                            <button
                              onClick={() => {
                                if (confirm("¿Borrar esta salida?")) eliminar(r.id);
                              }}
                              disabled={pending}
                              className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:text-red-600"
                              title="Borrar salida"
                            >
                              ✕
                            </button>
                          )}
                          {r.estado === "na" && (
                            <button onClick={() => run(() => marcarRetiro(r.id, "pendiente"))} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50">
                              Reactivar
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {open?.id === r.id && open.modo === "gasto" && (
                    <tr className="bg-neutral-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Cuenta de gasto
                            <select value={cuentaGasto} onChange={(e) => setCuentaGasto(e.target.value)} className={`${inputCls} w-72`}>
                              <option value="">Elegí la cuenta…</option>
                              {cuentasGasto.map((c) => (
                                <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Centro de costo
                            <select value={centroGasto} onChange={(e) => setCentroGasto(e.target.value)} className={`${inputCls} w-44`}>
                              {centros.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Pagado de (caja)
                            <select value={caja} onChange={(e) => setCaja(e.target.value)} className={`${inputCls} w-56`}>
                              {cuentasCaja.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            IVA (si aplica)
                            <input type="number" min={0} step="0.01" value={iva} onChange={(e) => setIva(Number(e.target.value))} className={`${inputCls} w-28 text-right tabular-nums`} />
                          </label>
                          <button onClick={() => ingresarGasto(r.id)} disabled={pending || !cuentaGasto || !caja || !centroGasto} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                            {pending ? "Posteando…" : "Ingresar y postear"}
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">Gasto de {fechaCorta(r.fecha)} por {money(r.monto)}, pagado de caja (Debe la cuenta / Haber la caja).</p>
                      </td>
                    </tr>
                  )}

                  {open?.id === r.id && open.modo === "pago" && (
                    <tr className="bg-neutral-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Proveedor
                            <select value={prov} onChange={(e) => { setProv(e.target.value); setCxpSel(""); }} className={`${inputCls} w-60`}>
                              <option value="">Elegí el proveedor…</option>
                              {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Factura por pagar
                            <select value={cxpSel} onChange={(e) => elegirCxp(e.target.value, r.monto)} disabled={!prov} className={`${inputCls} w-72`}>
                              <option value="">{prov ? "Elegí la factura…" : "Primero el proveedor"}</option>
                              {cxpDeProv.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.consecutivo ? `#${c.consecutivo} · ` : ""}{fechaCorta(c.fecha)} · saldo {money(c.saldo)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Monto a pagar
                            <input type="number" min={0} step="0.01" value={montoPago} onChange={(e) => setMontoPago(Number(e.target.value))} className={`${inputCls} w-32 text-right tabular-nums`} />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Pagado de (caja)
                            <select value={cajaPago} onChange={(e) => setCajaPago(e.target.value)} className={`${inputCls} w-56`}>
                              {cuentasCaja.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                            </select>
                          </label>
                          <button onClick={() => pagarFactura(r.id)} disabled={pending || !cxpSel || !(montoPago > 0) || (saldar && difPago > 0 && (!cuentaDif || !centroDif))} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                            {pending ? "Pagando…" : "Pagar y postear"}
                          </button>
                        </div>

                        {/* Diferencia: salió menos que la factura */}
                        {cxpSel && difPago > 0 && (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                            <label className="flex items-center gap-2 text-xs text-neutral-700">
                              <input type="checkbox" checked={saldar} onChange={(e) => setSaldar(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
                              De la caja salió {money(difPago)} menos que la factura — <strong>saldar la factura completa</strong> y mandar la diferencia a un ingreso.
                            </label>
                            {saldar && (
                              <div className="mt-2 flex flex-wrap items-end gap-3">
                                <label className="flex flex-col gap-1 text-xs text-neutral-500">
                                  Cuenta de la diferencia
                                  <select value={cuentaDif} onChange={(e) => setCuentaDif(e.target.value)} className={`${inputCls} w-64`}>
                                    {cuentasIngreso.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-neutral-500">
                                  Centro de costo
                                  <select value={centroDif} onChange={(e) => setCentroDif(e.target.value)} className={`${inputCls} w-44`}>
                                    {centros.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                                  </select>
                                </label>
                                <span className="pb-2 text-xs text-neutral-500">Diferencia a ingreso: <strong>{money(difPago)}</strong></span>
                              </div>
                            )}
                          </div>
                        )}

                        <p className="mt-1 text-xs text-neutral-400">
                          Registra el pago de la factura desde la caja (Debe la cuenta por pagar / Haber la caja). Sin marcar “saldar”, un monto menor deja la factura con saldo (pago parcial).
                          {cxpDeProv.length === 0 && prov && " Ese proveedor no tiene facturas pendientes."}
                        </p>
                      </td>
                    </tr>
                  )}

                  {open?.id === r.id && open.modo === "planilla" && (
                    <tr className="bg-neutral-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Planilla
                            <select value={planSel} onChange={(e) => elegirPlan(e.target.value, r.monto)} className={`${inputCls} w-80`}>
                              <option value="">Elegí la planilla…</option>
                              {planillas.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.titulo} · saldo {money(p.saldo)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Monto a pagar
                            <input type="number" min={0} step="0.01" value={montoPlan} onChange={(e) => setMontoPlan(Number(e.target.value))} className={`${inputCls} w-32 text-right tabular-nums`} />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-neutral-500">
                            Pagado de (caja)
                            <select value={cajaPlan} onChange={(e) => setCajaPlan(e.target.value)} className={`${inputCls} w-56`}>
                              {cuentasCaja.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
                            </select>
                          </label>
                          <button onClick={() => pagarPlanilla(r.id)} disabled={pending || !planSel || !(montoPlan > 0)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                            {pending ? "Pagando…" : "Pagar y postear"}
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">
                          Registra el pago de la planilla desde la caja (Debe salarios por pagar / Haber la caja). Aparece en la pantalla de la planilla y baja su saldo. Admite pago parcial.
                          {planillas.length === 0 && " No hay planillas con saldo pendiente."}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
