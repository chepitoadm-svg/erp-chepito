"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
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

function comparar(a: string | number, b: string | number, dir: "asc" | "desc") {
  const r =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "es", { numeric: true });
  return dir === "asc" ? r : -r;
}

// Encabezado ordenable: un clic ordena asc; otro clic invierte.
function Th({
  label,
  k,
  sort,
  setSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  setSort: (s: SortState) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  const flecha = active ? (sort.dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <th
      onClick={() => setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className={`cursor-pointer select-none px-2 py-1 font-medium hover:text-neutral-700 ${align === "right" ? "text-right" : "text-left"}`}
      title="Ordenar por esta columna"
    >
      {label} <span className={active ? "text-neutral-600" : "text-neutral-300"}>{flecha}</span>
    </th>
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
  const [state, formAction, pending] = useActionState(registrarAsientoBanco, inicial);

  const pendientes = lineas.filter((l) => l.estado === "pendiente");
  const conciliadas = lineas.filter((l) => l.estado === "conciliada");

  const valLibro = (m: MovimientoLibro, k: SortKey): string | number =>
    k === "fecha" ? m.fecha : k === "debito" ? m.debito : k === "credito" ? m.credito : m.numero != null ? String(m.numero) : m.glosa ?? m.tipo;
  const valBanco = (l: LineaBanco, k: SortKey): string | number =>
    k === "fecha" ? l.fecha : k === "debito" ? l.debito : k === "credito" ? l.credito : l.referencia ?? l.descripcion ?? "";

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

  const totLibrosDebito = movimientos.reduce((s, m) => s + m.debito, 0);
  const totLibrosCredito = movimientos.reduce((s, m) => s + m.credito, 0);
  const totBancoDebito = pendientes.reduce((s, l) => s + l.debito, 0);
  const totBancoCredito = pendientes.reduce((s, l) => s + l.credito, 0);

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
              <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Movimientos en libros ({movimientos.length})
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase text-neutral-400">
                    <tr>
                      <Th label="Fecha" k="fecha" sort={sortLibros} setSort={setSortLibros} />
                      <Th label="Asiento" k="doc" sort={sortLibros} setSort={setSortLibros} />
                      <Th label="Débito" k="debito" sort={sortLibros} setSort={setSortLibros} align="right" />
                      <Th label="Crédito" k="credito" sort={sortLibros} setSort={setSortLibros} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {movimientos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-neutral-400">
                          No hay movimientos de libros sin conciliar.
                        </td>
                      </tr>
                    )}
                    {movimientosOrd.map((m) => {
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
                        {movimientos.length} mov.
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
              <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Movimientos en bancos ({pendientes.length})
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-[10px] uppercase text-neutral-400">
                    <tr>
                      <Th label="Fecha" k="fecha" sort={sortBanco} setSort={setSortBanco} />
                      <Th label="Documento / detalle" k="doc" sort={sortBanco} setSort={setSortBanco} />
                      <Th label="Débito" k="debito" sort={sortBanco} setSort={setSortBanco} align="right" />
                      <Th label="Crédito" k="credito" sort={sortBanco} setSort={setSortBanco} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pendientes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-neutral-400">
                          Todas las líneas del banco están conciliadas.
                        </td>
                      </tr>
                    )}
                    {pendientesOrd.map((l) => {
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
                        {pendientes.length} líneas
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
