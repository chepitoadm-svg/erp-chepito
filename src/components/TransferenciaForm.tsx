"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearTransferencia, type FormState } from "@/app/(app)/inventario/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}
interface Linea {
  articulo_id: string;
  cantidad: string;
  detalle: string;
}

interface Props {
  articulos: Opcion[];
  bodegas: Opcion[];
}

const lineaVacia = (): Linea => ({ articulo_id: "", cantidad: "", detalle: "" });
const estadoInicial: FormState = {};

export default function TransferenciaForm({ articulos, bodegas }: Props) {
  const [state, formAction, pending] = useActionState(crearTransferencia, estadoInicial);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [glosa, setGlosa] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  function setLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [campo]: valor };
      return next;
    });
  }

  const lineasJSON = JSON.stringify(
    lineas
      .filter((l) => l.articulo_id && parseFloat(l.cantidad) > 0)
      .map((l) => ({
        articulo_id: l.articulo_id,
        cantidad: parseFloat(l.cantidad),
        detalle: l.detalle || null,
      })),
  );
  const mismasBodegas = origen && destino && origen === destino;
  const listo = origen && destino && !mismasBodegas && JSON.parse(lineasJSON).length > 0;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="bodega_origen_id" value={origen} />
      <input type="hidden" name="bodega_destino_id" value={destino} />
      <input type="hidden" name="glosa" value={glosa} />
      <input type="hidden" name="lineas" value={lineasJSON} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Bodega de origen</label>
          <select
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Seleccioná…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} — {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Bodega de destino</label>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className={`mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-neutral-900 ${
              mismasBodegas ? "border-red-400 bg-red-50" : "border-neutral-300"
            }`}
          >
            <option value="">Seleccioná…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} — {b.nombre}
              </option>
            ))}
          </select>
          {mismasBodegas && (
            <p className="mt-1 text-xs text-red-600">Origen y destino deben ser distintos.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Glosa (opcional)</label>
          <input
            type="text"
            value={glosa}
            onChange={(e) => setGlosa(e.target.value)}
            placeholder="Reparto a sucursal, etc."
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad a enviar</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <select
                    value={l.articulo_id}
                    onChange={(e) => setLinea(i, "articulo_id", e.target.value)}
                    className="w-full min-w-[220px] rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-900"
                  >
                    <option value="">Elegí un artículo…</option>
                    {articulos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={l.detalle}
                    onChange={(e) => setLinea(i, "detalle", e.target.value)}
                    placeholder="Detalle (opcional)"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.cantidad}
                    onChange={(e) => setLinea(i, "cantidad", e.target.value)}
                    className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setLineas((p) => p.filter((_, j) => j !== i))}
                    disabled={lineas.length <= 1}
                    className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
                    title="Quitar línea"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, lineaVacia()])}
                  className="text-neutral-700 hover:text-neutral-900"
                >
                  + Agregar línea
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al enviarla, la mercadería sale del origen y queda
        en tránsito hasta que el destino la reciba. No genera asiento.
      </p>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !listo}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link
          href="/inventario/transferencias"
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
