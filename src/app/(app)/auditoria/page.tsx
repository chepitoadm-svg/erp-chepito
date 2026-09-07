import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarAuditoria,
  listarTablasAuditoria,
  listarUsuariosAuditoria,
  type AuditoriaEvento,
} from "@/lib/data/auditoria";

// Etiqueta legible por tabla (las que no estén acá se humanizan solas).
const TABLA_LABEL: Record<string, string> = {
  asientos: "Asientos contables",
  asientos_lineas: "Líneas de asiento",
  asientos_anulaciones: "Anulaciones de asiento",
  facturas_compra: "Facturas de compra",
  pagos_proveedor: "Pagos a proveedores",
  gastos: "Gastos",
  gasto_pago: "Pagos de gasto",
  ventas_dia: "Ventas del día",
  planilla: "Planilla",
  planilla_pagos: "Pagos de planilla",
  conciliaciones_banco: "Conciliaciones",
  perfiles: "Usuarios",
  roles: "Perfiles de acceso",
  "auth.users": "Cuentas (login)",
  cuentas: "Catálogo de cuentas",
  proveedores: "Proveedores",
  desecho_mes: "Desecho",
};
const tablaLbl = (t: string) =>
  TABLA_LABEL[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const ACCION = {
  insert: { txt: "Creó", cls: "bg-green-50 text-green-700" },
  update: { txt: "Modificó", cls: "bg-amber-50 text-amber-700" },
  delete: { txt: "Eliminó", cls: "bg-red-50 text-red-700" },
} as const;

function fechaHora(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} ${h}:${mi}`;
}

// Campos "ruidosos" que no aportan al leer un cambio.
const OCULTOS = new Set([
  "actualizado_en",
  "actualizado_por",
  "creado_en",
  "creado_por",
  "id",
  "search_vector",
]);

const val = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Filas cambiadas entre antes y después (para update); para insert/delete, el set completo. */
function diff(ev: AuditoriaEvento): { campo: string; antes: string; despues: string }[] {
  const antes = ev.datos_antes ?? {};
  const despues = ev.datos_despues ?? {};
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)].filter((k) => !OCULTOS.has(k)));
  const filas: { campo: string; antes: string; despues: string }[] = [];
  for (const k of claves) {
    const a = val((antes as Record<string, unknown>)[k]);
    const d = val((despues as Record<string, unknown>)[k]);
    if (ev.accion === "update" && a === d) continue;
    filas.push({ campo: k, antes: a, despues: d });
  }
  return filas;
}

type SP = { usuario?: string; tabla?: string; accion?: string; desde?: string; hasta?: string };

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("auditoria.ver"))) redirect("/");
  const sp = await searchParams;
  const filtro = {
    usuario: sp.usuario || undefined,
    tabla: sp.tabla || undefined,
    accion: sp.accion || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    limit: 300,
  };

  const [eventos, tablas, usuarios] = await Promise.all([
    listarAuditoria(filtro),
    listarTablasAuditoria(),
    listarUsuariosAuditoria(),
  ]);
  const hayFiltro = !!(sp.usuario || sp.tabla || sp.accion || sp.desde || sp.hasta);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Auditoría</h1>
          <p className="text-sm text-neutral-500">
            Todo movimiento del sistema queda registrado: quién lo hizo, qué cambió y cuándo.
          </p>
        </div>
        <Link
          href="/auditoria/sesiones"
          className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Tiempo de trabajo →
        </Link>
      </div>

      {/* Filtros */}
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Usuario
          <select name="usuario" defaultValue={sp.usuario ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.usuario_id} value={u.usuario_id}>
                {u.nombre_completo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Módulo
          <select name="tabla" defaultValue={sp.tabla ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {tablas.map((t) => (
              <option key={t.tabla} value={t.tabla}>
                {tablaLbl(t.tabla)} ({t.n})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Acción
          <select name="accion" defaultValue={sp.accion ?? ""} className={inputCls}>
            <option value="">Todas</option>
            <option value="insert">Creó</option>
            <option value="update">Modificó</option>
            <option value="delete">Eliminó</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={inputCls} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {hayFiltro && (
          <Link href="/auditoria" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      <p className="mb-2 text-xs text-neutral-400">
        {eventos.length === 300
          ? "Mostrando los 300 movimientos más recientes. Afiná con los filtros para ver más atrás."
          : `${eventos.length} movimiento(s).`}
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha y hora</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Módulo</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {eventos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  {hayFiltro ? "Ningún movimiento con esos filtros." : "Sin movimientos registrados."}
                </td>
              </tr>
            ) : (
              eventos.map((ev) => {
                const a = ACCION[ev.accion] ?? { txt: ev.accion, cls: "bg-neutral-100 text-neutral-600" };
                const cambios = diff(ev);
                return (
                  <tr key={ev.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{fechaHora(ev.ocurrido_en)}</td>
                    <td className="px-4 py-3 text-neutral-800">{ev.usuario_nombre ?? "(sistema)"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${a.cls}`}>{a.txt}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{tablaLbl(ev.tabla)}</td>
                    <td className="px-4 py-3">
                      {cambios.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <details className="group">
                          <summary className="cursor-pointer list-none text-neutral-600 hover:text-neutral-900">
                            <span className="underline">
                              {ev.accion === "update"
                                ? `${cambios.length} campo(s)`
                                : ev.accion === "insert"
                                  ? "ver datos"
                                  : "ver eliminado"}
                            </span>
                          </summary>
                          <div className="mt-2 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-2">
                            <table className="text-xs">
                              <tbody>
                                {cambios.map((c) => (
                                  <tr key={c.campo}>
                                    <td className="py-0.5 pr-3 font-medium text-neutral-500">{c.campo}</td>
                                    {ev.accion === "update" ? (
                                      <>
                                        <td className="py-0.5 pr-2 text-red-600 line-through">{c.antes}</td>
                                        <td className="py-0.5 text-green-700">{c.despues}</td>
                                      </>
                                    ) : (
                                      <td className="py-0.5 text-neutral-700">
                                        {ev.accion === "delete" ? c.antes : c.despues}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
