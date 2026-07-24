"use client";

import { useActionState, useEffect, useState } from "react";
import { guardarBases, type FormState } from "@/app/(app)/admin/actions";

interface Final {
  id: string;
  codigo: string;
  nombre: string;
}
interface Base {
  centro_destino_id: string;
  porcentaje: string;
}
interface Props {
  periodoId: string;
  origenId: string;
  finales: Final[];
  inicial: { centro_destino_id: string; porcentaje: number }[];
}

const inicialState: FormState = {};

export default function ProrrateoBases({ periodoId, origenId, finales, inicial }: Props) {
  const desdeInicial = (): Base[] =>
    inicial.length
      ? inicial.map((b) => ({
          centro_destino_id: b.centro_destino_id,
          porcentaje: String(b.porcentaje),
        }))
      : [{ centro_destino_id: "", porcentaje: "" }];

  const [state, formAction, pending] = useActionState(guardarBases, inicialState);
  const [bases, setBases] = useState<Base[]>(desdeInicial);

  // Re-sincroniza con lo que quedó guardado en la base cuando el server
  // revalida (o sea, después de un guardado exitoso).
  //
  // Hace falta porque React 19 resetea el <form> al terminar la server action:
  // los <select> controlados quedan en blanco en el DOM y, como el estado no
  // cambió, React no los vuelve a sincronizar. Se re-sincroniza aquí en vez de
  // remontar con una key para no perder el mensaje de "Bases guardadas".
  const firmaInicial = inicial
    .map((b) => `${b.centro_destino_id}@${b.porcentaje}`)
    .join("|");
  useEffect(() => {
    setBases(desdeInicial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaInicial]);

  const suma = bases.reduce((s, b) => s + (parseFloat(b.porcentaje) || 0), 0);
  const suma100 = Math.abs(suma - 100) < 0.005;

  const set = (i: number, campo: keyof Base, v: string) =>
    setBases((p) => p.map((b, j) => (j === i ? { ...b, [campo]: v } : b)));

  const json = JSON.stringify(
    bases
      .filter((b) => b.centro_destino_id && parseFloat(b.porcentaje) > 0)
      .map((b) => ({ centro_destino_id: b.centro_destino_id, porcentaje: parseFloat(b.porcentaje) })),
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="periodo" value={periodoId} />
      <input type="hidden" name="origen" value={origenId} />
      <input type="hidden" name="bases" value={json} />

      {bases.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={b.centro_destino_id}
            onChange={(e) => set(i, "centro_destino_id", e.target.value)}
            className="min-w-[160px] rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Destino…</option>
            {finales.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nombre}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={b.porcentaje}
            onChange={(e) => set(i, "porcentaje", e.target.value)}
            placeholder="%"
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm outline-none focus:border-neutral-900"
          />
          <span className="text-sm text-neutral-400">%</span>
          <button
            type="button"
            onClick={() => setBases((p) => p.filter((_, j) => j !== i))}
            disabled={bases.length <= 1}
            className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setBases((p) => [...p, { centro_destino_id: "", porcentaje: "" }])}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          + Destino
        </button>
        <span className={`text-sm ${suma100 ? "text-green-600" : "text-amber-600"}`}>
          Suma: {suma.toFixed(2)}% {suma100 ? "✓" : "(debe ser 100)"}
        </span>
        <button
          type="submit"
          disabled={pending || !suma100}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar bases"}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">{state.ok}</p>}
    </form>
  );
}
