"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarVentaExt, guardarClienteExt, desactivarClienteExt } from "@/app/(app)/ventas/externas/actions";
import type { ClienteExt, CeldaVentaExt } from "@/lib/data/ventasExternas";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Formato de celda: en colones con separador de miles; vacío si es 0.
const fmtCell = (n: number) => (n > 0 ? "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 2 }) : "");
const key = (cliente: string, dia: number) => `${cliente}_${dia}`;

export default function VentasExtGrid({
  anio,
  mes,
  clientes,
  celdas,
}: {
  anio: number;
  mes: number;
  clientes: ClienteExt[];
  celdas: CeldaVentaExt[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [msg, setMsg] = useState("");

  const dias = useMemo(() => {
    const n = new Date(anio, mes, 0).getDate();
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [anio, mes]);

  // Mapa vivo de montos guardados.
  const [montos, setMontos] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    celdas.forEach((c) => m.set(key(c.cliente_id, c.dia), c.monto));
    return m;
  });
  const [guardando, setGuardando] = useState<string | null>(null);

  const fecha = (dia: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

  const onCellBlur = (clienteId: string, dia: number, raw: string): number => {
    const val = Math.max(0, Number(raw.replace(/[^\d.-]/g, "")) || 0);
    const k = key(clienteId, dia);
    const prev = montos.get(k) ?? 0;
    if (val === prev) return val;
    const nuevo = new Map(montos);
    if (val > 0) nuevo.set(k, val);
    else nuevo.delete(k);
    setMontos(nuevo);
    setGuardando(k);
    start(async () => {
      const r = await guardarVentaExt(clienteId, fecha(dia), val);
      setGuardando(null);
      if (r.error) setMsg(r.error);
    });
    return val;
  };

  const totalCliente = (clienteId: string) => dias.reduce((s, d) => s + (montos.get(key(clienteId, d)) ?? 0), 0);
  const totalDia = (dia: number) => clientes.reduce((s, c) => s + (montos.get(key(c.id, dia)) ?? 0), 0);
  const totalMes = clientes.reduce((s, c) => s + totalCliente(c.id), 0);

  const [nuevoCli, setNuevoCli] = useState("");
  const agregarCliente = () => {
    const nombre = nuevoCli.trim();
    if (!nombre) return;
    start(async () => {
      const r = await guardarClienteExt(null, nombre, clientes.length + 1);
      if (r.error) setMsg(r.error);
      else {
        setNuevoCli("");
        router.refresh();
      }
    });
  };
  const renombrar = (c: ClienteExt) => {
    const nombre = prompt("Nuevo nombre del cliente:", c.nombre);
    if (nombre == null || nombre.trim() === c.nombre) return;
    start(async () => {
      const r = await guardarClienteExt(c.id, nombre.trim(), c.orden);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });
  };
  const quitar = (c: ClienteExt) => {
    if (!confirm(`¿Quitar el cliente "${c.nombre}" de la grilla? (sus ventas quedan guardadas)`)) return;
    start(async () => {
      const r = await desactivarClienteExt(c.id, false);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });
  };

  // Navegación tipo hoja de cálculo: Enter/↓ baja, ↑ sube, ←/→ entre clientes
  // (cuando el cursor está al borde del texto). Al mover foco, la celda actual
  // pierde el foco y se guarda sola.
  const focusCell = (d: number, ci: number) => {
    if (d < 1 || d > dias.length || ci < 0 || ci >= clientes.length) return;
    document.getElementById(`vext-${d}-${ci}`)?.focus();
  };
  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, d: number, ci: number) => {
    const el = e.currentTarget;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(d + 1, ci);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(d - 1, ci);
    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length) {
      e.preventDefault();
      focusCell(d, ci + 1);
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0) {
      e.preventDefault();
      focusCell(d, ci - 1);
    }
  };

  const inCell =
    "w-full bg-transparent px-1 py-1 text-right text-xs tabular-nums outline-none focus:bg-blue-50";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={nuevoCli}
          onChange={(e) => setNuevoCli(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregarCliente()}
          placeholder="Nuevo cliente…"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
        />
        <button onClick={agregarCliente} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          + Agregar cliente
        </button>
        {msg && <span className="text-xs text-red-600">{msg}</span>}
      </div>

      {clientes.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Agregá clientes o importá el Excel para empezar.
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-neutral-200 bg-white" style={{ maxHeight: "70vh" }}>
          <table className="text-xs">
            <thead className="sticky top-0 z-10 bg-neutral-50">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-left font-medium text-neutral-500">
                  Día
                </th>
                {clientes.map((c) => (
                  <th key={c.id} className="min-w-[108px] border-b border-neutral-200 px-2 py-2 font-medium text-neutral-700">
                    <div className="flex items-center justify-between gap-1">
                      <button onClick={() => renombrar(c)} className="truncate hover:underline" title="Renombrar">
                        {c.nombre}
                      </button>
                      <button onClick={() => quitar(c)} className="text-neutral-300 hover:text-red-600" title="Quitar">
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
                <th className="min-w-[108px] border-b border-l border-neutral-200 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-500">
                  Total día
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {dias.map((d) => (
                <tr key={d} className="hover:bg-neutral-50/40">
                  <td className="sticky left-0 z-10 border-r border-neutral-200 bg-white px-2 py-1 text-neutral-500">
                    {String(d).padStart(2, "0")}
                  </td>
                  {clientes.map((c, ci) => {
                    const k = key(c.id, d);
                    return (
                      <td key={c.id} className={`px-0 ${guardando === k ? "bg-amber-50" : ""}`}>
                        <input
                          id={`vext-${d}-${ci}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={fmtCell(montos.get(k) ?? 0)}
                          onFocus={(e) => {
                            const v = montos.get(k);
                            e.target.value = v ? String(v) : "";
                            e.target.select();
                          }}
                          onKeyDown={(e) => onCellKey(e, d, ci)}
                          onBlur={(e) => {
                            const val = onCellBlur(c.id, d, e.target.value);
                            e.target.value = fmtCell(val);
                          }}
                          className={inCell}
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-neutral-200 bg-neutral-50/50 px-2 py-1 text-right font-medium tabular-nums text-neutral-700">
                    {totalDia(d) ? money(totalDia(d)) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-neutral-100">
              <tr>
                <td className="sticky left-0 z-10 border-t border-r border-neutral-300 bg-neutral-100 px-2 py-2 font-semibold text-neutral-700">
                  Total
                </td>
                {clientes.map((c) => (
                  <td key={c.id} className="border-t border-neutral-300 px-2 py-2 text-right font-semibold tabular-nums text-neutral-900">
                    {totalCliente(c.id) ? money(totalCliente(c.id)) : ""}
                  </td>
                ))}
                <td className="border-l border-t border-neutral-300 bg-neutral-200 px-2 py-2 text-right font-bold tabular-nums text-neutral-900">
                  {money(totalMes)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-400">
        Escribí el monto en cada celda; se guarda al salir del campo. Tocá el nombre del cliente para renombrarlo.
      </p>
    </div>
  );
}
