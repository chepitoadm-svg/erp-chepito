"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearRecepcion, type FormState } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo?: string;
  nombre: string;
}
interface Linea {
  articulo_id: string;
  cantidad: string;
  costo_unitario: string;
  detalle: string;
}

interface Props {
  proveedores: Opcion[];
  bodegas: Opcion[];
  articulos: { id: string; codigo: string; nombre: string }[];
}

const lineaVacia = (): Linea => ({ articulo_id: "", cantidad: "", costo_unitario: "", detalle: "" });
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};

export default function RecepcionForm({ proveedores, bodegas, articulos }: Props) {
  const [state, formAction, pending] = useActionState(crearRecepcion, estadoInicial);
  const [proveedor, setProveedor] = useState("");
  const [bodega, setBodega] = useState("");
  const [glosa, setGlosa] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  function setLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [campo]: valor };
      return next;
    });
  }

  const totalValor = lineas.reduce(
    (s, l) => s + (parseFloat(l.cantidad) || 0) * (parseFloat(l.costo_unitario) || 0),
    0,
  );
  const lineasJSON = JSON.stringify(
    lineas
      .filter((l) => l.articulo_id && parseFloat(l.cantidad) > 0)
      .map((l) => ({
        articulo_id: l.articulo_id,
        cantidad: parseFloat(l.cantidad),
        costo_unitario: parseFloat(l.costo_unitario) || 0,
        detalle: l.detalle || null,
      })),
  );
  const listo = proveedor && bodega && JSON.parse(lineasJSON).length > 0;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="proveedor_id" value={proveedor} />
      <input type="hidden" name="bodega_id" value={bodega} />
      <input type="hidden" name="glosa" value={glosa} />
      <input type="hidden" name="lineas" value={lineasJSON} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Proveedor</label>
          <select
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Seleccioná…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Bodega de ingreso</label>
          <select
            value={bodega}
            onChange={(e) => setBodega(e.target.value)}
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
          <label className="block text-sm font-medium text-neutral-700">Glosa (opcional)</label>
          <input
            type="text"
            value={glosa}
            onChange={(e) => setGlosa(e.target.value)}
            placeholder="Nota de la entrega"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
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
                    <option value="">Elegí…</option>
                    {articulos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.cantidad}
                    onChange={(e) => setLinea(i, "cantidad", e.target.value)}
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.costo_unitario}
                    onChange={(e) => setLinea(i, "costo_unitario", e.target.value)}
                    className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money((parseFloat(l.cantidad) || 0) * (parseFloat(l.costo_unitario) || 0))}
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
            <tr className="font-medium">
              <td colSpan={3} className="px-3 py-2 text-right text-neutral-500">
                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, lineaVacia()])}
                  className="text-neutral-700 hover:text-neutral-900"
                >
                  + Agregar línea
                </button>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{money(totalValor)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar, la mercadería entra al inventario
        y se postea Debe Inventario / Haber “Mercadería recibida por facturar”.
        La factura llega después y salda esa cuenta puente.
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
        <Link href="/compras/recepciones" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
