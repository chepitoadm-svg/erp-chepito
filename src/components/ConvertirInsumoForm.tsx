"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { FormState } from "@/app/(app)/produccion/actions";
import SelectBuscable from "@/components/SelectBuscable";

export interface ArticuloFuente {
  ref_id: string;
  nombre: string;
  cpb: number; // costo por unidad base
  unidad_natural: string; // g | ml | unidad
}

interface Props {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  insumo: { id: string; nombre: string; costo_compra: number; cantidad_compra: number; unidad: string };
  articulos: ArticuloFuente[];
  uso: { count: number; nombres: string[] };
}

const FBASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, L: 1000, unidad: 1, porcion: 1 };
const familia = (u: string) => (u === "g" || u === "kg" ? "peso" : u === "ml" || u === "L" ? "volumen" : "conteo");
// Muestra el costo por unidad base como un precio legible (por kg / por L / por unidad).
function porUnidadLegible(cpb: number, fam: string): string {
  const factor = fam === "peso" || fam === "volumen" ? 1000 : 1;
  const u = fam === "peso" ? "kg" : fam === "volumen" ? "L" : "unidad";
  const v = cpb * factor;
  return "₡" + v.toLocaleString("es-CR", { maximumFractionDigits: 2 }) + " / " + u;
}

export default function ConvertirInsumoForm({ action, insumo, articulos, uso }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [articuloId, setArticuloId] = useState("");

  const famInsumo = familia(insumo.unidad);
  const baseInsumo = (insumo.cantidad_compra || 0) * (FBASE[insumo.unidad] ?? 1);
  const cpbInsumo = baseInsumo > 0 ? insumo.costo_compra / baseInsumo : 0;

  const porId = useMemo(() => new Map(articulos.map((a) => [a.ref_id, a])), [articulos]);
  const sel = porId.get(articuloId);
  const famArt = sel ? familia(sel.unidad_natural) : null;
  const familiasDistintas = !!famArt && famArt !== famInsumo;

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <input type="hidden" name="id" value={insumo.id} />
      <input type="hidden" name="articulo_id" value={articuloId} />

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <div className="font-medium text-neutral-900">{insumo.nombre}</div>
        <div className="mt-1 text-neutral-600">
          Costo a mano hoy: <b>{porUnidadLegible(cpbInsumo, famInsumo)}</b>{" "}
          <span className="text-neutral-400">
            (₡{insumo.costo_compra.toLocaleString("es-CR")} por {insumo.cantidad_compra} {insumo.unidad})
          </span>
        </div>
        <div className="mt-1 text-neutral-600">
          {uso.count === 0
            ? "Ninguna receta lo usa todavía."
            : `Lo usan ${uso.count} receta${uso.count === 1 ? "" : "s"}: ${uso.nombres.slice(0, 6).join(", ")}${uso.nombres.length > 6 ? "…" : ""}`}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Artículo del inventario que corresponde
        </label>
        <SelectBuscable
          value={articuloId}
          onChange={setArticuloId}
          options={articulos.map((a) => ({ value: a.ref_id, label: a.nombre }))}
          placeholder="Buscar artículo del inventario…"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Solo aparecen artículos cuya unidad sirve para recetas (kg, g, L, ml, unidad).
        </p>
      </div>

      {sel && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Costo a mano (hoy)</span>
            <span className="tabular-nums text-neutral-700">{porUnidadLegible(cpbInsumo, famInsumo)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-neutral-500">Costo del inventario (quedaría)</span>
            <span className="tabular-nums font-semibold text-neutral-900">
              {porUnidadLegible(sel.cpb, famArt!)}
            </span>
          </div>
          {sel.cpb === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              ⚠ Este artículo no tiene costo en el inventario todavía (quedaría en ₡0 hasta que registres una
              compra). Mejor elegí otro o esperá a tener su costo.
            </p>
          )}
          {familiasDistintas && (
            <p className="mt-2 text-xs text-red-600">
              ⚠ Las unidades no son del mismo tipo (uno es {famInsumo} y el otro {famArt}). Revisá que sea el
              artículo correcto.
            </p>
          )}
        </div>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Al convertir: las recetas que usaban este insumo pasarán a costear por el <b>promedio ponderado del
        inventario</b> (se actualiza solo con las compras), y el insumo manual quedará <b>desactivado</b>. La
        cantidad y unidad de cada receta no cambian. Esto no se deshace con un botón.
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !articuloId}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Convirtiendo…" : "Convertir a artículo"}
        </button>
        <Link href="/produccion" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
