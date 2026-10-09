"use client";

import { useState } from "react";

interface InsumoGasto {
  insumo_id: string;
  nombre: string;
  proveedor: string;
  base_qty: number;
  unidad: string;
  colones: number;
  productos: { nombre: string; base_qty: number; colones: number }[];
}

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fam = (u: string) => (u === "g" || u === "kg" ? "peso" : u === "ml" || u === "L" ? "volumen" : "conteo");
function fmtQty(base: number, unidad: string): string {
  const f = fam(unidad);
  const n = (x: number, d = 2) => x.toLocaleString("es-CR", { maximumFractionDigits: d });
  if (f === "peso") return n(base / 1000, 3) + " kg";
  if (f === "volumen") return n(base / 1000, 3) + " L";
  return n(base, 0) + " u";
}

export default function GastoInsumos({ insumos }: { insumos: InsumoGasto[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (insumos.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
        No hay consumo en ese rango.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">Materia prima</th>
            <th className="px-4 py-3 font-medium">Proveedor</th>
            <th className="px-4 py-3 text-right font-medium">Cantidad</th>
            <th className="px-4 py-3 text-right font-medium">Costo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {insumos.map((i) => {
            const open = abierto === i.insumo_id;
            return (
              <FragmentRow key={i.insumo_id}>
                <tr
                  className="cursor-pointer hover:bg-neutral-50"
                  onClick={() => setAbierto(open ? null : i.insumo_id)}
                >
                  <td className="px-4 py-3 text-neutral-900">
                    <span className="mr-1 inline-block w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
                    {i.nombre}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{i.proveedor || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmtQty(i.base_qty, i.unidad)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{money(i.colones)}</td>
                </tr>
                {open && (
                  <tr className="bg-neutral-50/60">
                    <td colSpan={4} className="px-4 py-2">
                      <div className="mb-1 text-xs text-neutral-500">
                        Los {fmtQty(i.base_qty, i.unidad)} de <b>{i.nombre}</b> se gastaron en:
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {i.productos.map((p) => (
                            <tr key={p.nombre} className="border-t border-neutral-200/70">
                              <td className="py-1.5 pl-6 text-neutral-700">{p.nombre}</td>
                              <td className="py-1.5 text-right tabular-nums text-neutral-600">{fmtQty(p.base_qty, i.unidad)}</td>
                              <td className="py-1.5 text-right tabular-nums text-neutral-700">{money(p.colones)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Permite devolver dos <tr> por item sin romper la tabla.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
