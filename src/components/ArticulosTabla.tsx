"use client";

import Link from "next/link";
import { useState } from "react";
import type { KardexMovimiento } from "@/lib/data/inventario";

interface Articulo {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad_codigo: string;
  iva_porcentaje: number;
  existencia_total: number;
  costo_promedio: number;
  valor_total: number;
  estado: string;
  inventariable: boolean;
}

interface Props {
  articulos: Articulo[];
  alternarEstado: (formData: FormData) => Promise<void>;
  cargarKardex: (id: string) => Promise<KardexMovimiento[]>;
}

const fmt = (n: number) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TIPO_ART: Record<string, string> = {
  materia_prima: "Materia prima",
  producto_terminado: "Producto term.",
  suministro: "Suministro",
};
const MOV: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  compra: "Compra",
  ajuste_pos: "Ajuste +",
  ajuste_neg: "Ajuste −",
  ajuste_valor: "Ajuste valor",
  transferencia_envio: "Transf. envío",
  transferencia_recepcion: "Transf. recibo",
  devolucion_compra: "Devol. compra",
  venta: "Venta",
  produccion_consumo: "Consumo producción",
  produccion_entrada: "Entrada producción",
  devolucion_venta: "Devol. venta",
  cierre_fisico: "Cierre físico",
};

export default function ArticulosTabla({ articulos, alternarEstado, cargarKardex }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [kardex, setKardex] = useState<Record<string, KardexMovimiento[] | "loading">>({});

  const t = norm(q);
  const filtrados = !t
    ? articulos
    : articulos.filter((a) => norm(a.codigo).includes(t) || norm(a.nombre).includes(t));

  async function toggle(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (!kardex[id]) {
      setKardex((k) => ({ ...k, [id]: "loading" }));
      try {
        const movs = await cargarKardex(id);
        setKardex((k) => ({ ...k, [id]: movs }));
      } catch {
        setKardex((k) => ({ ...k, [id]: [] }));
      }
    }
  }

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        {t && <span className="ml-3 text-xs text-neutral-400">{filtrados.length} de {articulos.length}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Unidad</th>
              <th className="px-4 py-3 font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Existencia</th>
              <th className="px-4 py-3 text-right font-medium">Costo prom.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-neutral-400">
                  {articulos.length === 0 ? "Todavía no hay artículos." : "Ningún artículo coincide con la búsqueda."}
                </td>
              </tr>
            )}
            {filtrados.map((a) => {
              const abierto = open === a.id;
              const movs = kardex[a.id];
              return (
                <FragmentRow key={a.id}>
                  <tr className={a.estado === "inactivo" ? "opacity-50" : ""}>
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(a.id)}
                        className="text-neutral-400 hover:text-neutral-900"
                        title="Ver movimientos / compras"
                      >
                        {abierto ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">{a.codigo}</td>
                    <td className="px-4 py-3 text-neutral-900">
                      {a.nombre}
                      {!a.inventariable && (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">no inventariable</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{TIPO_ART[a.tipo] ?? a.tipo}</td>
                    <td className="px-4 py-3 text-neutral-600">{a.unidad_codigo}</td>
                    <td className="px-4 py-3 text-neutral-600">{a.iva_porcentaje}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(a.existencia_total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(a.costo_promedio)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{fmt(a.valor_total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          a.estado === "activo"
                            ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                            : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                        }
                      >
                        {a.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/inventario/articulos/${a.id}`} className="text-neutral-600 hover:text-neutral-900">
                          Editar
                        </Link>
                        <form action={alternarEstado}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="estado" value={a.estado} />
                          <button type="submit" className="text-neutral-500 hover:text-neutral-900">
                            {a.estado === "activo" ? "Inactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="bg-neutral-50/60">
                      <td colSpan={11} className="px-4 py-3">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Movimientos de {a.nombre}
                        </div>
                        {movs === "loading" || movs === undefined ? (
                          <div className="py-2 text-sm text-neutral-400">Cargando…</div>
                        ) : movs.length === 0 ? (
                          <div className="py-2 text-sm text-neutral-400">Sin movimientos todavía (no se ha comprado ni ingresado).</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-sm">
                              <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
                                <tr>
                                  <th className="py-1.5 pr-4 font-medium">Fecha</th>
                                  <th className="py-1.5 pr-4 font-medium">Movimiento</th>
                                  <th className="py-1.5 pr-4 font-medium">Bodega</th>
                                  <th className="py-1.5 pr-4 text-right font-medium">Cantidad</th>
                                  <th className="py-1.5 pr-4 text-right font-medium">Costo unit.</th>
                                  <th className="py-1.5 pr-4 text-right font-medium">Costo total</th>
                                  <th className="py-1.5 text-right font-medium">Existencia desp.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {movs.map((m) => (
                                  <tr key={m.id} className="border-t border-neutral-200/60">
                                    <td className="py-1.5 pr-4 text-neutral-600">{m.fecha}</td>
                                    <td className="py-1.5 pr-4 text-neutral-800">{MOV[m.tipo] ?? m.tipo}</td>
                                    <td className="py-1.5 pr-4 text-neutral-500">{m.bodega_codigo}</td>
                                    <td className={"py-1.5 pr-4 text-right tabular-nums " + (m.cantidad < 0 ? "text-red-700" : "text-neutral-700")}>{fmt(m.cantidad)}</td>
                                    <td className="py-1.5 pr-4 text-right tabular-nums text-neutral-500">{fmt(m.costo_unitario)}</td>
                                    <td className="py-1.5 pr-4 text-right tabular-nums text-neutral-700">{fmt(m.costo_total)}</td>
                                    <td className="py-1.5 text-right tabular-nums text-neutral-600">{fmt(m.existencia_despues)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
