"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarMes } from "@/app/(app)/cierre/actions";

export default function CerrarMesBtn({ cierreId, cerrado }: { cierreId: string; cerrado: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const toggle = () =>
    start(async () => {
      setError("");
      const r = await cerrarMes(cierreId, !cerrado);
      if (r.error) setError(r.error);
      else router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md px-4 py-2 text-sm font-medium ${
          cerrado
            ? "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            : "bg-neutral-900 text-white hover:bg-neutral-800"
        }`}
      >
        {pending ? "…" : cerrado ? "Reabrir mes" : "Cerrar mes"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
