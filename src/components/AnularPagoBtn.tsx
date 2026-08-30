"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anularPago } from "@/app/(app)/planilla/actions";

export default function AnularPagoBtn({ pagoId, planillaId }: { pagoId: string; planillaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-red-600 hover:text-red-800">
        anular
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="motivo"
        className="w-28 rounded border border-neutral-300 px-1.5 py-0.5 text-xs outline-none"
      />
      <button
        type="button"
        disabled={pending || !motivo.trim()}
        onClick={() =>
          start(async () => {
            const r = await anularPago(pagoId, planillaId, motivo);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
      >
        {pending ? "…" : "ok"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-neutral-400">
        ✕
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
