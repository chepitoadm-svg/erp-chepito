"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { FormState } from "@/app/(app)/produccion/actions";
import type { FuenteReceta, RecetaEdit } from "@/lib/data/recetas";
import { UNIDADES } from "@/lib/validation/produccion";
import SelectBuscable from "@/components/SelectBuscable";

interface LineaUI {
  key: string; // "tipo:id" (igual que FuenteReceta.key); "" = sin elegir
  cantidad: string;
  unidad: string;
}

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fuentes: FuenteReceta[];
  inicial?: RecetaEdit;
  esProductoDefault?: boolean;
}

const FBASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, L: 1000, unidad: 1, porcion: 1 };
const baseDe = (cant: number, u: string) => (cant || 0) * (FBASE[u] ?? 1);
const money = (n: number) => "₡" + (isFinite(n) ? n : 0).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

export default function RecetaForm({ modo, action, fuentes, inicial, esProductoDefault }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [esProducto, setEsProducto] = useState<boolean>(inicial?.es_producto ?? esProductoDefault ?? true);
  const [lineas, setLineas] = useState<LineaUI[]>(
    inicial?.lineas.map((l) => ({ key: `${l.tipo_ref}:${l.ref_id}`, cantidad: String(l.cantidad), unidad: l.unidad })) ?? [],
  );
  const [precio, setPrecio] = useState<string>(inicial?.precio_venta != null ? String(inicial.precio_venta) : "");

  const fuentePorKey = useMemo(() => new Map(fuentes.map((f) => [f.key, f])), [fuentes]);
  const opciones = useMemo(() => fuentes.map((f) => ({ value: f.key, label: f.nombre })), [fuentes]);

  // Costo de cada línea y total, en vivo.
  const costoLinea = (l: LineaUI): number => {
    const f = fuentePorKey.get(l.key);
    if (!f) return 0;
    return baseDe(Number(l.cantidad), l.unidad) * f.cpb;
  };
  const total = lineas.reduce((a, l) => a + costoLinea(l), 0);
  const precioNum = Number(precio.replace(",", "."));
  const margen = esProducto && precioNum > 0 ? precioNum - total : null;
  const margenPct = margen != null && precioNum > 0 ? (margen / precioNum) * 100 : null;

  const setLinea = (i: number, patch: Partial<LineaUI>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const quitarLinea = (i: number) => setLineas((ls) => ls.filter((_, j) => j !== i));
  const agregarLinea = () => setLineas((ls) => [...ls, { key: "", cantidad: "", unidad: "" }]);
  const elegirFuente = (i: number, key: string) => {
    const f = fuentePorKey.get(key);
    setLinea(i, { key, unidad: f?.unidad_natural || lineas[i]?.unidad || "g" });
  };

  // Lo que se envía: solo líneas con fuente elegida.
  const lineasJson = JSON.stringify(
    lineas
      .filter((l) => l.key)
      .map((l) => {
        const [tipo_ref, ref_id] = l.key.split(":");
        return { tipo_ref, ref_id, cantidad: Number(l.cantidad), unidad: l.unidad };
      }),
  );

  return (
    <form action={formAction} className="space-y-6">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}
      <input type="hidden" name="es_producto" value={esProducto ? "true" : "false"} />
      <input type="hidden" name="lineas_json" value={lineasJson} />

      {/* Tipo */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEsProducto(true)}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (esProducto ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600")
          }
        >
          Producto final
        </button>
        <button
          type="button"
          onClick={() => setEsProducto(false)}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium " +
            (!esProducto ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600")
          }
        >
          Receta intermedia
        </button>
      </div>

      {/* Cabecera */}
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-neutral-700">Nombre</label>
          <input name="nombre" required minLength={2} maxLength={200} defaultValue={inicial?.nombre ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Clasificación</label>
          <input name="clasificacion" maxLength={120} defaultValue={inicial?.clasificacion ?? ""} placeholder="Opcional (ej. Masa)" className={inputCls} />
        </div>

        {esProducto ? (
          <div>
            <label className="block text-sm font-medium text-neutral-700">Precio de venta (₡)</label>
            <input
              name="precio_venta"
              type="number"
              step="any"
              min="0"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Opcional"
              className={inputCls}
            />
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700">Rinde — cantidad</label>
              <input name="rinde_cantidad" type="number" step="any" min="0" defaultValue={inicial?.rinde_cantidad ?? ""} className={inputCls} />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-neutral-700">Unidad</label>
              <select name="rinde_unidad" defaultValue={inicial?.rinde_unidad ?? ""} className={inputCls}>
                <option value="">…</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Líneas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ingredientes</h2>
          <button type="button" onClick={agregarLinea} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
            ＋ Agregar línea
          </button>
        </div>

        {lineas.length === 0 && (
          <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
            Sin líneas todavía. Agregá los ingredientes (artículos del inventario, insumos manuales u otras recetas).
          </p>
        )}

        <div className="space-y-2">
          {lineas.map((l, i) => {
            const f = fuentePorKey.get(l.key);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-neutral-200 bg-white p-2">
                <div className="min-w-[220px] flex-1">
                  <label className="block text-xs text-neutral-500">Ingrediente</label>
                  <SelectBuscable
                    value={l.key}
                    onChange={(v) => elegirFuente(i, v)}
                    options={opciones}
                    placeholder="Buscar…"
                    className={inputCls}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-neutral-500">Cantidad</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.cantidad}
                    onChange={(e) => setLinea(i, { cantidad: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-neutral-500">Unidad</label>
                  <select value={l.unidad} onChange={(e) => setLinea(i, { unidad: e.target.value })} className={inputCls}>
                    <option value="">…</option>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28 text-right">
                  <label className="block text-xs text-neutral-500">Costo</label>
                  <div className="py-2 text-sm tabular-nums text-neutral-700">{f ? money(costoLinea(l)) : "—"}</div>
                </div>
                <button type="button" onClick={() => quitarLinea(i)} className="px-2 py-2 text-neutral-400 hover:text-red-600" title="Quitar línea">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resumen de costo */}
      <div className="max-w-sm rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Costo total</span>
          <span className="font-semibold tabular-nums text-neutral-900">{money(total)}</span>
        </div>
        {esProducto && precioNum > 0 && (
          <>
            <div className="mt-1 flex justify-between">
              <span className="text-neutral-500">Precio de venta</span>
              <span className="tabular-nums text-neutral-700">{money(precioNum)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1">
              <span className="text-neutral-500">Margen</span>
              <span className={"font-semibold tabular-nums " + (margen! >= 0 ? "text-green-700" : "text-red-700")}>
                {money(margen!)} {margenPct != null && `(${margenPct.toLocaleString("es-CR", { maximumFractionDigits: 1 })}%)`}
              </span>
            </div>
          </>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar cambios"}
        </button>
        <Link href="/produccion" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
