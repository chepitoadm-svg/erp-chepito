"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarSalidaExt, borrarSalidaExt } from "@/app/(app)/ventas/externas/actions";
import type { SalidaExt } from "@/lib/data/ventasExternas";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMonto = (n: number) => (n > 0 ? "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 2 }) : "");
const fechaCorta = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export default function SalidasExt({
  anio,
  mes,
  salidas,
}: {
  anio: number;
  mes: number;
  salidas: SalidaExt[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [msg, setMsg] = useState("");

  const hoy = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const [nFecha, setNFecha] = useState(hoy);
  const [nDesc, setNDesc] = useState("");
  const [nMonto, setNMonto] = useState("");

  const total = salidas.reduce((s, x) => s + x.monto, 0);
  const inputCls = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

  const agregar = () => {
    const monto = Number(nMonto.replace(/[^\d.-]/g, ""));
    if (!(monto > 0)) {
      setMsg("Poné un monto válido.");
      return;
    }
    start(async () => {
      setMsg("");
      const r = await guardarSalidaExt(null, nFecha, nDesc, monto);
      if (r.error) setMsg(r.error);
      else {
        setNDesc("");
        setNMonto("");
        router.refresh();
      }
    });
  };

  const editar = (s: SalidaExt, campo: "fecha" | "descripcion" | "monto", valor: string) => {
    const fecha = campo === "fecha" ? valor : s.fecha;
    const desc = campo === "descripcion" ? valor : (s.descripcion ?? "");
    const monto = campo === "monto" ? Number(valor.replace(/[^\d.-]/g, "")) : s.monto;
    if (!(monto > 0)) return;
    if (fecha === s.fecha && desc === (s.descripcion ?? "") && monto === s.monto) return;
    start(async () => {
      const r = await guardarSalidaExt(s.id, fecha, desc, monto);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });
  };

  const borrar = (s: SalidaExt) =>
    start(async () => {
      const r = await borrarSalidaExt(s.id);
      if (r.error) setMsg(r.error);
      else router.refresh();
    });

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-800">Salidas del mes</h2>
        <span className="text-sm text-neutral-600">
          Total salidas: <span className="font-semibold text-neutral-900">{money(total)}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {/* Fila para agregar */}
            <tr className="bg-neutral-50/60">
              <td className="px-4 py-2">
                <input type="date" value={nFecha} onChange={(e) => setNFecha(e.target.value)} className={inputCls} />
              </td>
              <td className="px-4 py-2">
                <input
                  value={nDesc}
                  onChange={(e) => setNDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregar()}
                  placeholder="Concepto (compra, depósito…)"
                  className={`${inputCls} w-full`}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  value={nMonto}
                  onChange={(e) => setNMonto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregar()}
                  inputMode="decimal"
                  placeholder="0"
                  className={`${inputCls} w-28 text-right tabular-nums`}
                />
              </td>
              <td className="px-4 py-2 text-right">
                <button onClick={agregar} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
                  + Agregar
                </button>
              </td>
            </tr>

            {salidas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Sin salidas este mes.
                </td>
              </tr>
            ) : (
              salidas.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <input
                      type="date"
                      defaultValue={s.fecha}
                      onBlur={(e) => editar(s, "fecha", e.target.value)}
                      className={`${inputCls} bg-transparent`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      defaultValue={s.descripcion ?? ""}
                      onBlur={(e) => editar(s, "descripcion", e.target.value)}
                      className={`${inputCls} w-full bg-transparent`}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      defaultValue={fmtMonto(s.monto)}
                      onFocus={(e) => {
                        e.target.value = String(s.monto);
                        e.target.select();
                      }}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value.replace(/[^\d.-]/g, "")) || 0);
                        editar(s, "monto", e.target.value);
                        e.target.value = fmtMonto(v || s.monto);
                      }}
                      inputMode="decimal"
                      className={`${inputCls} w-28 bg-transparent text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => borrar(s)} className="text-neutral-400 hover:text-red-600" title="Borrar">
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
    </div>
  );
}
