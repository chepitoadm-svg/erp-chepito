"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  registrarAsientoBanco,
  conciliarLinea,
  desconciliarLinea,
  type FormState,
} from "@/app/(app)/tesoreria/conciliaciones/actions";
import SelectBuscable, { type OpcionBuscable } from "@/components/SelectBuscable";
import type { LineaBanco, MovimientoLibro } from "@/lib/data/conciliaciones";

const inicial: FormState = {};

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

export default function LineaBancoAccion({
  linea,
  cuentas,
  centros,
  movsCompatibles,
  editable,
}: {
  linea: LineaBanco;
  cuentas: OpcionBuscable[];
  centros: Centro[];
  movsCompatibles: MovimientoLibro[];
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState(registrarAsientoBanco, inicial);

  // Línea ya conciliada: mostrar el asiento y (si editable) desconciliar.
  if (linea.estado === "conciliada") {
    return (
      <div className="flex items-center justify-end gap-2">
        {linea.asiento_id && (
          <Link href={`/asientos/${linea.asiento_id}`} className="text-xs text-green-700 underline hover:no-underline">
            {linea.asiento_numero ? `#${linea.asiento_numero}` : "asiento"}
          </Link>
        )}
        {editable && (
          <form action={desconciliarLinea}>
            <input type="hidden" name="linea_id" value={linea.id} />
            <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
              desconciliar
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!editable) return <span className="text-xs text-amber-600">pendiente</span>;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
      >
        Registrar / conciliar
      </button>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-left">
      {/* Emparejar con un movimiento de libros ya existente */}
      {movsCompatibles.length > 0 && (
        <div className="mb-3 border-b border-neutral-200 pb-3">
          <p className="mb-1 text-xs font-medium text-neutral-600">Ya está en libros:</p>
          {movsCompatibles.map((m) => (
            <form key={m.id} action={conciliarLinea} className="flex items-center justify-between gap-2 py-0.5">
              <input type="hidden" name="linea_id" value={linea.id} />
              <input type="hidden" name="asiento_linea_id" value={m.id} />
              <span className="text-xs text-neutral-600">
                {m.fecha} · {m.numero ? `#${m.numero}` : m.tipo} · {m.glosa}
              </span>
              <button type="submit" className="rounded border border-green-300 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50">
                emparejar
              </button>
            </form>
          ))}
        </div>
      )}

      {/* Registrar el asiento faltante (comisión, interés, SINPE, etc.) */}
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="linea_id" value={linea.id} />
        <p className="text-xs font-medium text-neutral-600">Registrar como asiento nuevo:</p>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">Cuenta de contrapartida</span>
          <SelectBuscable
            name="cuenta_contra_id"
            required
            placeholder="Buscá la cuenta (gasto, ingreso, etc.)…"
            options={cuentas}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">Centro (si la cuenta es de resultado)</span>
          <select
            name="centro_costo_id"
            defaultValue=""
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          >
            <option value="">— sin centro —</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          name="glosa"
          defaultValue={linea.descripcion ?? ""}
          placeholder="Glosa"
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? "Registrando…" : "Crear y conciliar"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-800">
            Cerrar
          </button>
        </div>
      </form>
    </div>
  );
}
