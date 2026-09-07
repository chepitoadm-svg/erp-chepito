"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pagarGasto } from "@/app/(app)/gastos/actions";

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
}

const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PagarGastoBtn({
  gastoId,
  saldo,
  cuentas,
  fechaDefault,
}: {
  gastoId: string;
  saldo: number;
  cuentas: Cuenta[];
  fechaDefault: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cuenta, setCuenta] = useState("");
  const [fecha, setFecha] = useState(fechaDefault);
  const [monto, setMonto] = useState<number>(saldo);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setMonto(saldo);
          setAbierto(true);
        }}
        className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Pagar
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="rounded border border-neutral-300 px-1.5 py-1 text-xs outline-none">
        <option value="">Banco / caja…</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} · {c.nombre}
          </option>
        ))}
      </select>
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded border border-neutral-300 px-1.5 py-1 text-xs outline-none" />
      <input
        type="number"
        min={0}
        max={saldo}
        step="0.01"
        value={monto}
        onChange={(e) => setMonto(Number(e.target.value))}
        title={`Saldo ₡${money(saldo)}`}
        className="w-24 rounded border border-neutral-300 px-1.5 py-1 text-right text-xs tabular-nums outline-none"
      />
      <button
        type="button"
        disabled={pending || !cuenta || !(monto > 0)}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await pagarGasto(gastoId, cuenta, fecha, monto);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "…" : "Pagar"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="px-1 text-xs text-neutral-400 hover:text-neutral-700">
        ✕
      </button>
      {error && <span className="w-full text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
