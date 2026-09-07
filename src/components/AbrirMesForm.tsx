"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarCierre } from "@/app/(app)/cierre/actions";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function AbrirMesForm({ anioActual, mesActual }: { anioActual: number; mesActual: number }) {
  const router = useRouter();
  const [anio, setAnio] = useState(anioActual);
  const [mes, setMes] = useState(mesActual);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const abrir = () =>
    start(async () => {
      setError("");
      const r = await generarCierre(anio, mes);
      if (r.error) setError(r.error);
      else router.push(`/cierre/${anio}/${mes}`);
    });

  const inputCls = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-end gap-2">
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
          {MESES.map((m, idx) => (
            <option key={m} value={idx + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className={`${inputCls} w-24`}
        />
        <button
          onClick={abrir}
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Abriendo…" : "Abrir mes"}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
