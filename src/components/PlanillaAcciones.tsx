"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postearPlanilla, pagarPlanilla, anularPlanilla, descartarPlanilla } from "@/app/(app)/planilla/actions";
import type { BancoOpcion } from "@/lib/data/planilla";

export default function PlanillaAcciones({
  id,
  estado,
  saldo,
  bancos,
  fechaDefault,
}: {
  id: string;
  estado: "borrador" | "confirmada" | "anulada" | "descartada";
  saldo: number;
  bancos: BancoOpcion[];
  fechaDefault: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [banco, setBanco] = useState("");
  const [fecha, setFecha] = useState(fechaDefault);
  const [monto, setMonto] = useState<number>(saldo);
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<"" | "pagar" | "anular" | "eliminar">("");
  const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const run = (fn: () => Promise<{ ok?: string; error?: string }>, irLista = false) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        setModo("");
        if (irLista) router.push("/planilla");
        else router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {msg.ok && <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg.ok}</p>}
      {msg.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {estado === "borrador" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => postearPlanilla(id))}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {pending ? "Posteando…" : "Postear provisión"}
            </button>
            <Link
              href={`/planilla/${id}/editar`}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Editar
            </Link>
            <button
              type="button"
              onClick={() => setModo(modo === "eliminar" ? "" : "eliminar")}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Eliminar
            </button>
          </>
        )}
        {estado === "confirmada" && saldo > 0.005 && (
          <button
            type="button"
            onClick={() => {
              setMonto(saldo);
              setModo(modo === "pagar" ? "" : "pagar");
            }}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Registrar pago
          </button>
        )}
        {estado === "confirmada" && (
          <button
            type="button"
            onClick={() => setModo(modo === "anular" ? "" : "anular")}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Anular
          </button>
        )}
      </div>

      {modo === "pagar" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Banco / caja
            <select value={banco} onChange={(e) => setBanco(e.target.value)} className="min-w-[240px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none">
              <option value="">Elegí la cuenta…</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Fecha del pago
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Monto (saldo ₡{fmt(saldo)})
            <input
              type="number"
              min={0}
              max={saldo}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm tabular-nums outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setMonto(saldo)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
          >
            Todo el saldo
          </button>
          <button
            type="button"
            disabled={pending || !banco || !(monto > 0)}
            onClick={() => run(() => pagarPlanilla(id, banco, fecha, monto))}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? "Pagando…" : "Confirmar pago"}
          </button>
        </div>
      )}

      {modo === "eliminar" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
          <span className="text-sm text-neutral-700">¿Eliminar esta planilla en borrador? No afecta la contabilidad.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => descartarPlanilla(id), true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button type="button" onClick={() => setModo("")} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Cancelar
          </button>
        </div>
      )}

      {modo === "anular" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
            Motivo de la anulación
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none" />
          </label>
          <button
            type="button"
            disabled={pending || !motivo.trim()}
            onClick={() => run(() => anularPlanilla(id, motivo))}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Anulando…" : "Confirmar anulación"}
          </button>
        </div>
      )}
    </div>
  );
}
