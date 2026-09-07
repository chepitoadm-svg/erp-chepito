"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarVentasExt } from "@/app/(app)/ventas/externas/actions";

export default function ImportarVentasExt({ anio, mes }: { anio: number; mes: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const ref = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("anio", String(anio));
    fd.set("mes", String(mes));
    fd.set("archivo", f);
    start(async () => {
      setMsg({});
      const r = await importarVentasExt(fd);
      setMsg(r);
      if (!r.error) router.refresh();
    });
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
        {pending ? "Importando…" : "Importar Excel"}
        <input ref={ref} type="file" accept=".xlsx,.xls" onChange={onFile} disabled={pending} className="hidden" />
      </label>
      {msg.error && <span className="text-xs text-red-600">{msg.error}</span>}
      {msg.ok && <span className="text-xs text-green-700">{msg.ok}</span>}
    </div>
  );
}
