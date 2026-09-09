"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generarCierre } from "@/app/(app)/cierre/actions";

// Vuelve a generar el checklist del mes para traer los requisitos nuevos que se
// hayan agregado después de abrirlo (fn_generar_cierre agrega los que falten
// sin duplicar los existentes).
export default function RegenerarMesBtn({ anio, mes }: { anio: number; mes: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const run = () =>
    start(async () => {
      setMsg("");
      const r = await generarCierre(anio, mes);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        title="Trae al mes los requisitos nuevos que hayas agregado en Requisitos"
      >
        {pending ? "Actualizando…" : "Traer requisitos nuevos"}
      </button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}
