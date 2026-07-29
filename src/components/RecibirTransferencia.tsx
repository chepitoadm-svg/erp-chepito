"use client";

import { useActionState, useState } from "react";
import { recibirTransferencia, type FormState } from "@/app/(app)/inventario/actions";

interface LineaPend {
  linea: number;
  articulo_codigo: string;
  articulo_nombre: string;
  pendiente: number;
}

const inicial: FormState = {};

export default function RecibirTransferencia({
  id,
  lineas,
}: {
  id: string;
  lineas: LineaPend[];
}) {
  const [state, formAction, pending] = useActionState(recibirTransferencia, inicial);
  const [modo, setModo] = useState<"todo" | "parcial">("todo");
  const [cant, setCant] = useState<Record<number, string>>(() =>
    Object.fromEntries(lineas.map((l) => [l.linea, String(l.pendiente)])),
  );

  const recibidasJSON = JSON.stringify(
    lineas
      .map((l) => ({ linea: l.linea, cantidad: parseFloat(cant[l.linea] ?? "0") || 0 }))
      .filter((r) => r.cantidad > 0),
  );

  return (
    <form action={formAction} className="rounded-lg border border-neutral-200 bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="recibidas" value={recibidasJSON} />

      <div className="mb-3 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modo === "todo"}
            onChange={() => setModo("todo")}
            className="h-4 w-4"
          />
          Recibir todo lo pendiente
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modo === "parcial"}
            onChange={() => setModo("parcial")}
            className="h-4 w-4"
          />
          Recepción parcial
        </label>
      </div>

      {modo === "parcial" && (
        <div className="mb-3 overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Artículo</th>
                <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                <th className="px-3 py-2 text-right font-medium">Recibir ahora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lineas.map((l) => (
                <tr key={l.linea}>
                  <td className="px-3 py-2 text-neutral-800">
                    <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                    {l.articulo_nombre}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{l.pendiente}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max={l.pendiente}
                      value={cant[l.linea] ?? ""}
                      onChange={(e) => setCant((p) => ({ ...p, [l.linea]: e.target.value }))}
                      className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right outline-none focus:border-neutral-900"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Registrando…" : "Registrar recepción"}
      </button>
    </form>
  );
}
