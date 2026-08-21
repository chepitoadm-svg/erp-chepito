"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  conciliarLinea,
  desconciliarLinea,
  conciliarAutomatico,
  registrarAsientoBanco,
  type FormState,
} from "@/app/(app)/tesoreria/conciliaciones/actions";
import SelectBuscable, { type OpcionBuscable } from "@/components/SelectBuscable";
import type { LineaBanco, MovimientoLibro } from "@/lib/data/conciliaciones";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const c2 = (n: number) => Math.round(Number(n) * 100);
const inicial: FormState = {};

type SortKey = "fecha" | "doc" | "debito" | "credito";
type SortState = { key: SortKey | null; dir: "asc" | "desc" };

// Los montos (number) se comparan por valor; el resto (documento, fecha) como
// texto alfabético. NO se usa numeric:true a propósito: el documento se ordena
// alfabéticamente (ej. "301438829" antes que "63006688"), como el usuario lo
// espera, no por magnitud del número.
function comparar(a: string | number, b: string | number, dir: "asc" | "desc") {
  const r =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "es");
  return dir === "asc" ? r : -r;
}

// Encabezado ordenable: un clic ordena asc; otro clic invierte. `extra` (ej. el
// botón de filtro) se renderiza al lado y no dispara el orden.
function Th({
  label,
  k,
  sort,
  setSort,
  align = "left",
  extra,
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  setSort: (s: SortState) => void;
  align?: "left" | "right";
  extra?: React.ReactNode;
}) {
  const active = sort.key === k;
  const flecha = active ? (sort.dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <th className={`px-2 py-1 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
          className="cursor-pointer select-none uppercase hover:text-neutral-700"
          title="Ordenar por esta columna"
        >
          {label} <span className={active ? "text-neutral-600" : "text-neutral-300"}>{flecha}</span>
        </button>
        {extra}
      </span>
    </th>
  );
}

// Filtro tipo Excel: botón ▾ que abre una lista de valores para marcar cuáles
// mostrar. `null` = todos. Se posiciona con portal para no ser recortado.
function FiltroColumna({
  valores,
  seleccion,
  onAplicar,
}: {
  valores: string[];
  seleccion: Set<string> | null;
  onAplicar: (s: Set<string> | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);

  const distintos = useMemo(
    () => Array.from(new Set(valores.map((v) => v || "(vacío)"))).sort((a, b) => a.localeCompare(b, "es")),
    [valores],
  );
  const activo = seleccion !== null;

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 288)) });
    setDraft(seleccion ? new Set(seleccion) : new Set(distintos));
    setBusca("");
    setAbierto(true);
  };
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  const visibles = busca.trim() ? distintos.filter((v) => v.toLowerCase().includes(busca.trim().toLowerCase())) : distintos;
  const todosMarcados = visibles.length > 0 && visibles.every((v) => draft.has(v));
  const toggle = (v: string) => {
    const s = new Set(draft);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    setDraft(s);
  };
  const toggleTodos = () => {
    const s = new Set(draft);
    if (todosMarcados) visibles.forEach((v) => s.delete(v));
    else visibles.forEach((v) => s.add(v));
    setDraft(s);
  };
  const aplicar = () => {
    onAplicar(draft.size >= distintos.length ? null : new Set(draft));
    setAbierto(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={`rounded px-1 text-[11px] leading-none ${activo ? "bg-blue-100 text-blue-700" : "text-neutral-400 hover:text-neutral-700"}`}
        title="Filtrar valores"
      >
        ▼
      </button>
      {abierto &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
            <div
              className="fixed z-50 w-72 rounded-md border border-neutral-300 bg-white shadow-lg"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="border-b border-neutral-200 p-2">
                <input
                  autoFocus
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar valor…"
                  className="w-full rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                />
              </div>
              <label className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
                Seleccionar todos {busca.trim() ? "(filtrados)" : ""}
              </label>
              <div className="max-h-64 overflow-y-auto py-1">
                {visibles.length === 0 && <p className="px-2 py-2 text-xs text-neutral-400">Sin coincidencias.</p>}
                {visibles.map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50">
                    <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} />
                    <span className="truncate" title={v}>
                      {v}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-200 p-2">
                <button type="button" onClick={() => setAbierto(false)} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">
                  Cancelar
                </button>
                <button type="button" onClick={aplicar} className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800">
                  Aceptar
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}

export default function ConciliadorPanel({
  conciliacionId,
  lineas,
  movimientos,
  cuentas,
  centros,
  editable,
}: {
  conciliacionId: string;
  lineas: LineaBanco[];
  movimientos: MovimientoLibro[];
  cuentas: OpcionBuscable[];
  centros: Centro[];
  editable: boolean;
}) {
  const [tab, setTab] = useState<"pendientes" | "conciliados">("pendientes");
  const [selBanco, setSelBanco] = useState<string | null>(null);
  const [selLibro, setSelLibro] = useState<string | null>(null);
  const [modoRegistrar, setModoRegistrar] = useState(false);
  const [sortLibros, setSortLibros] = useState<SortState>({ key: null, dir: "asc" });
  const [sortBanco, setSortBanco] = useState<SortState>({ key: null, dir: "asc" });
  const [filtroLibros, setFiltroLibros] = useState("");
  const [filtroBanco, setFiltroBanco] = useState("");
  const [selLibros, setSelLibros] = useState<Set<string> | null>(null);
  const [selBancoDoc, setSelBancoDoc] = useState<Set<string> | null>(null);
  const [state, formAction, pending] = useActionState(registrarAsientoBanco, inicial);

  const pendientes = lineas.filter((l) => l.estado === "pendiente");
  const conciliadas = lineas.filter((l) => l.estado === "conciliada");

  // "doc" ordena por el TEXTO/detalle (glosa/descripción), alfabético — lo que
  // empieza con A sale primero — no por el número de documento.
  const valLibro = (m: MovimientoLibro, k: SortKey): string | number =>
    k === "fecha" ? m.fecha : k === "debito" ? m.debito : k === "credito" ? m.credito : (m.glosa ?? "").toLowerCase();
  const valBanco = (l: LineaBanco, k: SortKey): string | number =>
    k === "fecha" ? l.fecha : k === "debito" ? l.debito : k === "credito" ? l.credito : (l.descripcion ?? "").toLowerCase();

  const movimientosOrd = useMemo(() => {
    if (!sortLibros.key) return movimientos;
    const k = sortLibros.key;
    return [...movimientos].sort((a, b) => comparar(valLibro(a, k), valLibro(b, k), sortLibros.dir));
  }, [movimientos, sortLibros]);
  const pendientesOrd = useMemo(() => {
    if (!sortBanco.key) return pendientes;
    const k = sortBanco.key;
    return [...pendientes].sort((a, b) => comparar(valBanco(a, k), valBanco(b, k), sortBanco.dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, sortBanco]);

  const banco = pendientes.find((l) => l.id === selBanco) ?? null;
  const libro = movimientos.find((m) => m.id === selLibro) ?? null;

  // Regla: débito del banco = crédito en libros y viceversa.
  const compatible = (l: LineaBanco, m: MovimientoLibro) =>
    c2(l.debito) === c2(m.credito) && c2(l.credito) === c2(m.debito);
  const parCalza = banco && libro ? compatible(banco, libro) : false;

  // Sugerencias: al elegir un lado, resaltar los del otro que calzan.
  const librosSugeridos = useMemo(
    () => (banco ? new Set(movimientos.filter((m) => compatible(banco, m)).map((m) => m.id)) : new Set<string>()),
    [banco, movimientos],
  );
  const bancosSugeridos = useMemo(
    () => (libro ? new Set(pendientes.filter((l) => compatible(l, libro)).map((l) => l.id)) : new Set<string>()),
    [libro, pendientes],
  );

  // Filtro "empieza con" (case-insensitive) por texto o por número de documento.
  const empiezaCon = (texto: string, f: string) => texto.toLowerCase().startsWith(f.trim().toLowerCase());
  const docVal = (s: string | null) => s || "(vacío)";
  const movimientosVis = movimientosOrd.filter(
    (m) =>
      (!filtroLibros.trim() ||
        empiezaCon(m.glosa ?? "", filtroLibros) ||
        empiezaCon(m.numero != null ? String(m.numero) : "", filtroLibros)) &&
      (selLibros === null || selLibros.has(docVal(m.glosa))),
  );
  const pendientesVis = pendientesOrd.filter(
    (l) =>
      (!filtroBanco.trim() || empiezaCon(l.descripcion ?? "", filtroBanco) || empiezaCon(l.referencia ?? "", filtroBanco)) &&
      (selBancoDoc === null || selBancoDoc.has(docVal(l.descripcion))),
  );

  const totLibrosDebito = movimientosVis.reduce((s, m) => s + m.debito, 0);
  const totLibrosCredito = movimientosVis.reduce((s, m) => s + m.credito, 0);
  const totBancoDebito = pendientesVis.reduce((s, l) => s + l.debito, 0);
  const totBancoCredito = pendientesVis.reduce((s, l) => s + l.credito, 0);

  return (
    <div>
      {/* Pestañas */}
      <div className="mb-3 flex gap-1 border-b border-neutral-200 text-sm">
        <button
          type="button"
          onClick={() => setTab("pendientes")}
          className={`-mb-px border-b-2 px-3 py-2 ${tab === "pendientes" ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
        >
          Pendientes de conciliación ({pendientes.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("conciliados")}
          className={`-mb-px border-b-2 px-3 py-2 ${tab === "conciliados" ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
        >
          Conciliados ({conciliadas.length})
        </button>
      </div>

      {tab === "conciliados" ? (
        <TablaConciliados lineas={conciliadas} editable={editable} />
      ) : (
        <>
          {/* Barra de acciones */}
          {editable && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <form action={conciliarLinea}>
                <input type="hidden" name="linea_id" value={selBanco ?? ""} />
                <input type="hidden" name="asiento_linea_id" value={selLibro ?? ""} />
                <button
                  type="submit"
                  disabled={!parCalza}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  title={parCalza ? "" : "Elegí una línea de cada lado con montos que calcen"}
                >
                  Conciliar seleccionados
                </button>
              </form>
              <form action={conciliarAutomatico}>
                <input type="hidden" name="id" value={conciliacionId} />
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Conciliar automático
                </button>
              </form>
              <button
                type="button"
                disabled={!selBanco}
                onClick={() => setModoRegistrar((v) => !v)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                title={selBanco ? "" : "Elegí primero una línea del banco"}
              >
                Generar asiento del banco
              </button>

              {/* Estado del par seleccionado */}
              <div className="ml-auto text-xs">
                {banco && libro ? (
                  parCalza ? (
                    <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">✓ Montos calzan</span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">✗ No calzan</span>
                  )
                ) : (
                  <span className="text-neutral-400">Elegí una línea de libros y una del banco</span>
                )}
              </div>
            </div>
          )}

          {/* Registrar asiento del banco (comisión / interés / SINPE) */}
          {editable && modoRegistrar && banco && (
            <form action={formAction} className="mb-4 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
              <input type="hidden" name="linea_id" value={banco.id} />
              <p className="mb-2 text-xs text-neutral-600">
                Crear el asiento de{" "}
                <span className="font-medium">
                  {banco.descripcion} · {banco.debito > 0 ? `sale ₡${money(banco.debito)}` : `entra ₡${money(banco.credito)}`}
                </span>{" "}
                y conciliarlo.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500">Cuenta de contrapartida</span>
                  <SelectBuscable
                    name="cuenta_contra_id"
                    required
                    placeholder="Buscá la cuenta (gasto, ingreso, comisión…)…"
                    options={cuentas}
                    className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500">Centro (si es cuenta de resultado)</span>
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
              </div>
              <input
                type="text"
                name="glosa"
                defaultValue={banco.descripcion ?? ""}
                placeholder="Glosa"
                className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
              {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {pending ? "Registrando…" : "Crear y conciliar"}
                </button>
                <button type="button" onClick={() => setModoRegistrar(false)} className="px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-800">
                  Cerrar
                </button>
              </div>
            </form>
          )}

          {/* Dos columnas: libros | banco */}
          <div className="grid gap-3 lg:grid-cols-2">
            {/* LIBROS */}
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Movimientos en libros</span>
                <input
                  type="search"
                  value={filtroLibros}
                  onChange={(e) => setFiltroLibros(e.target.value)}
                  placeholder="Filtrar (empieza con…)"
                  className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                />
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase text-neutral-400">
                    <tr>
                      <Th label="Fecha" k="fecha" sort={sortLibros} setSort={setSortLibros} />
                      <Th
                        label="Asiento"
                        k="doc"
                        sort={sortLibros}
                        setSort={setSortLibros}
                        extra={
                          <FiltroColumna valores={movimientos.map((m) => m.glosa ?? "")} seleccion={selLibros} onAplicar={setSelLibros} />
                        }
                      />
                      <Th label="Débito" k="debito" sort={sortLibros} setSort={setSortLibros} align="right" />
                      <Th label="Crédito" k="credito" sort={sortLibros} setSort={setSortLibros} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {movimientosVis.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-neutral-400">
                          {movimientos.length === 0 ? "No hay movimientos de libros sin conciliar." : "Nada coincide con el filtro."}
                        </td>
                      </tr>
                    )}
                    {movimientosVis.map((m) => {
                      const sel = m.id === selLibro;
                      const sug = librosSugeridos.has(m.id);
                      return (
                        <tr
                          key={m.id}
                          onClick={editable ? () => setSelLibro(sel ? null : m.id) : undefined}
                          className={`${editable ? "cursor-pointer" : ""} ${sel ? "bg-blue-50" : sug ? "bg-green-50/50" : "hover:bg-neutral-50"}`}
                        >
                          <td className="whitespace-nowrap px-2 py-1 text-neutral-600">{m.fecha}</td>
                          <td className="px-2 py-1 text-neutral-700">
                            <span className="text-neutral-500">{m.numero ? `#${m.numero}` : m.tipo}</span>
                            {m.glosa ? ` · ${m.glosa}` : ""}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-700">{m.debito ? money(m.debito) : ""}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-700">{m.credito ? money(m.credito) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-600">
                    <tr>
                      <td className="px-2 py-1" colSpan={2}>
                        {movimientosVis.length}
                        {filtroLibros.trim() ? ` de ${movimientos.length}` : ""} mov.
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(totLibrosDebito)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(totLibrosCredito)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* BANCO */}
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Movimientos en bancos</span>
                <input
                  type="search"
                  value={filtroBanco}
                  onChange={(e) => setFiltroBanco(e.target.value)}
                  placeholder="Filtrar (empieza con…)"
                  className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                />
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase text-neutral-400">
                    <tr>
                      <Th label="Fecha" k="fecha" sort={sortBanco} setSort={setSortBanco} />
                      <Th
                        label="Documento / detalle"
                        k="doc"
                        sort={sortBanco}
                        setSort={setSortBanco}
                        extra={
                          <FiltroColumna valores={pendientes.map((l) => l.descripcion ?? "")} seleccion={selBancoDoc} onAplicar={setSelBancoDoc} />
                        }
                      />
                      <Th label="Débito" k="debito" sort={sortBanco} setSort={setSortBanco} align="right" />
                      <Th label="Crédito" k="credito" sort={sortBanco} setSort={setSortBanco} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pendientesVis.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-neutral-400">
                          {pendientes.length === 0 ? "Todas las líneas del banco están conciliadas." : "Nada coincide con el filtro."}
                        </td>
                      </tr>
                    )}
                    {pendientesVis.map((l) => {
                      const sel = l.id === selBanco;
                      const sug = bancosSugeridos.has(l.id);
                      return (
                        <tr
                          key={l.id}
                          onClick={editable ? () => setSelBanco(sel ? null : l.id) : undefined}
                          className={`${editable ? "cursor-pointer" : ""} ${sel ? "bg-blue-50" : sug ? "bg-green-50/50" : "hover:bg-neutral-50"}`}
                        >
                          <td className="whitespace-nowrap px-2 py-1 text-neutral-600">{l.fecha}</td>
                          <td className="px-2 py-1 text-neutral-700">
                            {l.referencia && <span className="text-neutral-500">{l.referencia} · </span>}
                            {l.descripcion}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-700">{l.debito ? money(l.debito) : ""}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-700">{l.credito ? money(l.credito) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-600">
                    <tr>
                      <td className="px-2 py-1" colSpan={2}>
                        {pendientesVis.length}
                        {filtroBanco.trim() ? ` de ${pendientes.length}` : ""} líneas
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(totBancoDebito)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{money(totBancoCredito)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TablaConciliados({ lineas, editable }: { lineas: LineaBanco[]; editable: boolean }) {
  if (lineas.length === 0) {
    return <p className="rounded-lg border border-neutral-200 bg-white px-3 py-6 text-center text-sm text-neutral-400">Todavía no hay líneas conciliadas.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Documento / detalle</th>
            <th className="px-3 py-2 text-right font-medium">Débito</th>
            <th className="px-3 py-2 text-right font-medium">Crédito</th>
            <th className="px-3 py-2 text-right font-medium">Asiento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {lineas.map((l) => (
            <tr key={l.id} className="bg-green-50/30">
              <td className="px-3 py-2 text-neutral-600">{l.fecha}</td>
              <td className="px-3 py-2 text-neutral-700">
                {l.referencia && <span className="text-neutral-500">{l.referencia} · </span>}
                {l.descripcion}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{l.debito ? money(l.debito) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{l.credito ? money(l.credito) : ""}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  {l.asiento_id && (
                    <Link href={`/asientos/${l.asiento_id}`} className="text-xs text-green-700 underline hover:no-underline">
                      {l.asiento_numero ? `#${l.asiento_numero}` : "asiento"}
                    </Link>
                  )}
                  {editable && (
                    <form action={desconciliarLinea}>
                      <input type="hidden" name="linea_id" value={l.id} />
                      <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
                        desconciliar
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
