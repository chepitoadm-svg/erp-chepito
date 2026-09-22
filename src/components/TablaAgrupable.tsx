"use client";

import { useMemo, useState } from "react";
import FiltroColumna from "@/components/FiltroColumna";

const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ColumnaTabla<T> {
  key: string;
  titulo: string;
  /** Valor por el que agrupa (si la columna es agrupable). */
  grupo?: (row: T) => string;
  /** Contenido de la celda. */
  celda: (row: T) => React.ReactNode;
  /** Si devuelve número, la columna se subtotaliza por grupo y al pie. */
  monto?: (row: T) => number;
  align?: "left" | "right";
  fmt?: (n: number) => string;
  /** Valor por el que ordena al tocar el encabezado. Si no se da pero hay
   *  `monto`, se ordena por el monto. */
  orden?: (row: T) => number | string;
  /** Ancho mínimo opcional para la columna. */
  th?: string;
  /** Solo para agrupar: no se muestra como columna, pero se puede agregar a la
   *  barra de agrupado (ej. "Mes", "Año"). */
  soloGrupo?: boolean;
}

interface Props<T> {
  filas: T[];
  columnas: ColumnaTabla<T>[];
  claveFila: (row: T) => string;
  minWidth?: string;
  vacio?: React.ReactNode;
}

export default function TablaAgrupable<T>({ filas: todasLasFilas, columnas, claveFila, minWidth = "min-w-[720px]", vacio }: Props<T>) {
  const agrupables = columnas.filter((c) => c.grupo);
  const visibles = columnas.filter((c) => !c.soloGrupo);
  const [agrupado, setAgrupado] = useState<string[]>([]);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [arrastreOver, setArrastreOver] = useState(false);
  const [orden, setOrden] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  // Filtro tipo Excel por columna agrupable: null = mostrar todos.
  const [filtros, setFiltros] = useState<Record<string, Set<string> | null>>({});

  const colDe = (key: string) => columnas.find((c) => c.key === key)!;
  const noAgrupadas = agrupables.filter((c) => !agrupado.includes(c.key));

  // Aplica los filtros de columna a las filas antes de ordenar/agrupar.
  const filas = useMemo(() => {
    const activos = Object.entries(filtros).filter(([, sel]) => sel !== null) as [string, Set<string>][];
    if (activos.length === 0) return todasLasFilas;
    return todasLasFilas.filter((row) =>
      activos.every(([key, sel]) => {
        const c = colDe(key);
        return c?.grupo ? sel.has(c.grupo(row) || "(vacío)") : true;
      }),
    );
  }, [todasLasFilas, filtros, columnas]);
  // Valores distintos de una columna agrupable, para el desplegable del filtro.
  const valoresDe = (key: string) => {
    const c = colDe(key);
    return c?.grupo ? todasLasFilas.map((r) => c.grupo!(r) || "(vacío)") : [];
  };

  // Una columna es ordenable si tiene un accesor de orden explícito o un monto.
  const esOrdenable = (c: ColumnaTabla<T>) => !!c.orden || !!c.monto;
  const valorOrden = (c: ColumnaTabla<T>, row: T) =>
    c.orden ? c.orden(row) : c.monto ? c.monto(row) : 0;
  // Al tocar el encabezado: 1er clic mayor→menor, 2º menor→mayor, 3º sin orden.
  const alternarOrden = (key: string) =>
    setOrden((o) => (o?.key === key ? (o.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));
  const ordenar = (rows: T[]) => {
    if (!orden) return rows;
    const c = colDe(orden.key);
    if (!esOrdenable(c)) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = valorOrden(c, a);
      const vb = valorOrden(c, b);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return orden.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  };

  const agregar = (key: string) => {
    const c = colDe(key);
    if (!c?.grupo) return;
    setAgrupado((a) => (a.includes(key) ? a : [...a, key]));
  };
  const quitar = (key: string) => setAgrupado((a) => a.filter((k) => k !== key));
  const toggle = (path: string) =>
    setExpandidos((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });

  const subtotales = (rows: T[]) => {
    const r: Record<string, number> = {};
    for (const c of visibles) if (c.monto) r[c.key] = rows.reduce((s, x) => s + c.monto!(x), 0);
    return r;
  };
  const totalGeneral = useMemo(() => subtotales(filas), [filas, columnas]);
  const filasOrdenadas = useMemo(() => ordenar(filas), [filas, orden]);

  // Construir las filas a renderizar (grupos + datos) respetando lo expandido.
  type Entry =
    | { t: "g"; nivel: number; path: string; label: string; n: number; subt: Record<string, number>; abierto: boolean }
    | { t: "d"; nivel: number; row: T };

  const entries: Entry[] = [];
  const construir = (rows: T[], nivel: number, prefix: string) => {
    const key = agrupado[nivel];
    const col = colDe(key);
    const grupos = new Map<string, T[]>();
    for (const row of rows) {
      const g = col.grupo!(row) || "—";
      (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(row);
    }
    for (const [label, rs] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const path = `${prefix}/${key}=${label}`;
      const abierto = expandidos.has(path);
      entries.push({ t: "g", nivel, path, label, n: rs.length, subt: subtotales(rs), abierto });
      if (abierto) {
        if (nivel + 1 < agrupado.length) construir(rs, nivel + 1, path);
        else for (const row of rs) entries.push({ t: "d", nivel: nivel + 1, row });
      }
    }
  };
  if (agrupado.length > 0) construir(filasOrdenadas, 0, "");

  const fmt = (c: ColumnaTabla<T>, n: number) => (c.fmt ? c.fmt(n) : money(n));

  return (
    <div>
      {/* Barra de agrupado */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastreOver(true);
        }}
        onDragLeave={() => setArrastreOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastreOver(false);
          const key = e.dataTransfer.getData("text/col");
          if (key) agregar(key);
        }}
        className={`mb-2 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs text-neutral-200 ${
          arrastreOver ? "bg-neutral-600 ring-1 ring-inset ring-neutral-400" : "bg-neutral-700"
        }`}
      >
        <span aria-hidden className="text-sm leading-none text-neutral-400">
          ▦
        </span>
        {agrupado.length === 0 ? (
          <span className="text-neutral-300">Arrastrá una columna acá para agrupar, o tocá una de:</span>
        ) : (
          <>
            <span className="text-neutral-400">Agrupado por:</span>
            {agrupado.map((key, i) => (
              <span key={key} className="flex items-center gap-1">
                {i > 0 && <span className="text-neutral-500">›</span>}
                <span className="flex items-center gap-1 rounded-full border border-neutral-500 bg-neutral-800 px-2 py-0.5 text-neutral-100">
                  {colDe(key).titulo}
                  <button onClick={() => quitar(key)} className="text-neutral-400 hover:text-red-400" title="Quitar">
                    ✕
                  </button>
                </span>
              </span>
            ))}
            <button onClick={() => setAgrupado([])} className="ml-1 text-neutral-300 underline hover:text-white">
              limpiar
            </button>
            {noAgrupadas.length > 0 && <span className="ml-1 text-neutral-500">agregar:</span>}
          </>
        )}
        {/* Chips para agregar una columna de agrupado con un clic (incluye las
            "solo para agrupar" como Mes / Año). */}
        {noAgrupadas.map((c) => (
          <button
            key={c.key}
            onClick={() => agregar(c.key)}
            className="rounded-full border border-neutral-500 px-2 py-0.5 text-neutral-200 hover:bg-neutral-600"
            title={`Agrupar por ${c.titulo}`}
          >
            {c.titulo}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className={`w-full ${minWidth} text-sm`}>
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {visibles.map((c) => {
                const ordenable = esOrdenable(c);
                const activa = orden?.key === c.key;
                return (
                  <th
                    key={c.key}
                    draggable={!!c.grupo}
                    onDragStart={(e) => c.grupo && e.dataTransfer.setData("text/col", c.key)}
                    onClick={() => (c.grupo ? agregar(c.key) : ordenable ? alternarOrden(c.key) : undefined)}
                    title={
                      c.grupo ? "Arrastrá o tocá para agrupar" : ordenable ? "Tocá para ordenar" : undefined
                    }
                    className={`px-3 py-3 font-medium ${c.align === "right" ? "text-right" : ""} ${c.th ?? ""} ${
                      c.grupo ? "cursor-grab select-none hover:text-neutral-800" : ""
                    } ${ordenable ? "cursor-pointer select-none hover:text-neutral-800" : ""} ${
                      activa ? "text-neutral-800" : ""
                    }`}
                  >
                    {c.titulo}
                    {c.grupo && <span className="ml-1 text-neutral-300">⠿</span>}
                    {ordenable &&
                      (activa ? (
                        <span className="ml-1 text-neutral-700">{orden!.dir === "desc" ? "↓" : "↑"}</span>
                      ) : (
                        <span className="ml-1 text-neutral-300">⇅</span>
                      ))}
                    {c.grupo && (
                      <span className="ml-1 inline-flex align-middle">
                        <FiltroColumna
                          valores={valoresDe(c.key)}
                          seleccion={filtros[c.key] ?? null}
                          onAplicar={(sel) => setFiltros((f) => ({ ...f, [c.key]: sel }))}
                        />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={visibles.length} className="px-3 py-8 text-center text-neutral-400">
                  {vacio ?? "Sin datos."}
                </td>
              </tr>
            ) : agrupado.length === 0 ? (
              filasOrdenadas.map((row) => (
                <tr key={claveFila(row)}>
                  {visibles.map((c) => (
                    <td key={c.key} className={`px-3 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {c.celda(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              entries.map((e, idx) =>
                e.t === "g" ? (
                  <tr key={`g${idx}`} className="bg-neutral-50/70">
                    {visibles.map((c, ci) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 text-sm ${c.align === "right" ? "text-right tabular-nums font-semibold text-neutral-900" : ""}`}
                      >
                        {ci === 0 ? (
                          <button
                            onClick={() => toggle(e.path)}
                            className="flex items-center gap-1.5 font-semibold text-neutral-800"
                            style={{ paddingLeft: e.nivel * 16 }}
                          >
                            <span className="text-neutral-400">{e.abierto ? "▾" : "▸"}</span>
                            {e.label}
                            <span className="font-normal text-neutral-400">({e.n})</span>
                          </button>
                        ) : c.monto ? (
                          fmt(c, e.subt[c.key] ?? 0)
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ) : (
                  <tr key={claveFila(e.row)}>
                    {visibles.map((c, ci) => (
                      <td
                        key={c.key}
                        className={`px-3 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                        style={ci === 0 ? { paddingLeft: e.nivel * 16 + 16 } : undefined}
                      >
                        {c.celda(e.row)}
                      </td>
                    ))}
                  </tr>
                ),
              )
            )}
          </tbody>

          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-50">
                {visibles.map((c, ci) => (
                  <td key={c.key} className={`px-3 py-2 text-sm ${c.align === "right" ? "text-right font-bold tabular-nums text-neutral-900" : ""}`}>
                    {ci === 0 ? (
                      <span className="font-semibold text-neutral-700">Total ({filas.length})</span>
                    ) : c.monto ? (
                      fmt(c, totalGeneral[c.key] ?? 0)
                    ) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
