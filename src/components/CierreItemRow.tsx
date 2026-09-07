"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarItem, subirArchivo, anularArchivo, importarRetiros, importarRetirosDep } from "@/app/(app)/cierre/actions";
import type { CierreItem, ArchivoItem } from "@/lib/data/cierre";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 0 });

const CHIP: Record<string, string> = {
  listo: "bg-green-50 text-green-700 border-green-200",
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  na: "bg-neutral-100 text-neutral-500 border-neutral-200",
};
const CHIP_TXT: Record<string, string> = { listo: "Listo", pendiente: "Pendiente", na: "No aplica" };

// Enlace al módulo donde se hace el trabajo real (el que genera el asiento).
const MODULO: Record<string, { href: string; label: string }> = {
  ventas: { href: "/ventas/importar", label: "Importar ventas (QuPOS) →" },
  compras: { href: "/compras", label: "Ir a Compras →" },
  conciliacion: { href: "/tesoreria/conciliaciones", label: "Ir a Conciliaciones →" },
  planilla: { href: "/planilla", label: "Ir a Planilla →" },
};

// Texto del avance automático.
function autoTexto(i: CierreItem): string | null {
  if (!i.auto_fuente) return null;
  if (i.auto_fuente === "ventas") return `${i.auto_n ?? 0} día(s)` + (i.auto_monto ? ` · ${money(i.auto_monto)}` : "");
  if (i.auto_fuente === "compras")
    return `${i.auto_n ?? 0} factura(s)` + (i.auto_monto ? ` · ${money(i.auto_monto)}` : "");
  if (i.auto_fuente === "planilla") return `${i.auto_n ?? 0} planilla(s) posteada(s)`;
  if (i.auto_fuente === "retiros_caja" || i.auto_fuente === "retiros_dep") {
    if (i.auto_detalle === "sin_importar") return i.auto_fuente === "retiros_dep" ? "sin importar el PDF" : "sin importar el Excel";
    return `${i.auto_n ?? 0} de ${i.auto_monto ?? 0} retiros ingresados`;
  }
  if (i.auto_fuente === "salidas_vext") {
    if (i.auto_detalle === "sin_importar") return "sin salidas cargadas";
    return `${i.auto_n ?? 0} de ${i.auto_monto ?? 0} salidas ingresadas`;
  }
  if (i.auto_fuente === "conciliacion") {
    if (i.auto_detalle === "sin_estado") return "sin estado de cuenta cargado";
    return (i.auto_n ?? 0) === 0 ? "conciliada" : `faltan ${i.auto_n} línea(s) por conciliar`;
  }
  return null;
}

export default function CierreItemRow({
  item,
  archivos,
  bloqueado,
  anio,
  mes,
}: {
  item: CierreItem;
  archivos: ArchivoItem[];
  bloqueado: boolean;
  anio: number;
  mes: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const donde = item.centro_codigo ?? (item.cuenta_codigo ? `${item.cuenta_codigo} · ${item.cuenta_nombre}` : null);
  const auto = autoTexto(item);
  const esAuto = !!item.auto_fuente;
  const esRetiros = item.auto_fuente === "retiros_caja";
  const esRetirosDep = item.auto_fuente === "retiros_dep";

  const run = (fn: () => Promise<{ error?: string; ok?: string }>) =>
    start(async () => {
      setError("");
      setOk("");
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        if (r.ok) setOk(r.ok);
        router.refresh();
      }
    });

  const marcar = (estado: string) => run(() => marcarItem(item.item_id, estado));

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    if (esRetirosDep) {
      // PDF del reporte de retiros/depósitos: se LEE y llena los retiros.
      fd.set("anio", String(anio));
      fd.set("mes", String(mes));
      fd.set("archivo", f);
      run(() => importarRetirosDep(fd));
    } else if (esRetiros) {
      // El mismo archivo se LEE y llena los retiros (no es un adjunto suelto).
      fd.set("centro_codigo", item.centro_codigo ?? "");
      fd.set("anio", String(anio));
      fd.set("mes", String(mes));
      fd.set("archivo", f);
      run(() => importarRetiros(fd));
    } else {
      fd.set("item_id", item.item_id);
      fd.set("archivo", f);
      run(() => subirArchivo(fd));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-800">{item.nombre}</span>
            {donde && <span className="text-xs text-neutral-500">· {donde}</span>}
          </div>
          {auto && (
            <div className={`text-xs ${item.estado_efectivo === "listo" ? "text-green-600" : "text-neutral-500"}`}>
              {auto}
            </div>
          )}
          {item.nota && <div className="text-xs italic text-neutral-400">Nota: {item.nota}</div>}
          {item.auto_fuente === "retiros_dep" ? (
            <Link
              href={`/cierre/${anio}/${mes}/retiros-dep`}
              className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
            >
              Ver retiros y cotejar →
            </Link>
          ) : item.auto_fuente === "retiros_caja" && item.centro_codigo ? (
            <Link
              href={`/cierre/${anio}/${mes}/retiros/${item.centro_codigo}`}
              className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
            >
              Ver retiros y cotejar →
            </Link>
          ) : item.codigo === "ventas_ext" ? (
            <Link
              href={`/cierre/${anio}/${mes}/ventas-ext`}
              className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
            >
              Ver ventas externas y asientos →
            </Link>
          ) : item.auto_fuente === "salidas_vext" ? (
            <Link
              href={`/ventas/externas?anio=${anio}&mes=${mes}`}
              className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
            >
              Ver salidas y cotejar →
            </Link>
          ) : item.auto_fuente === "ventas" ? (
            <Link
              href={`/ventas?${item.centro_id ? `centro=${item.centro_id}&` : ""}desde=${anio}-${String(mes).padStart(2, "0")}-01&hasta=${anio}-${String(mes).padStart(2, "0")}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`}
              className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
            >
              Ver ventas del mes →
            </Link>
          ) : (
            item.auto_fuente &&
            MODULO[item.auto_fuente] && (
              <Link
                href={MODULO[item.auto_fuente].href}
                className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
              >
                {MODULO[item.auto_fuente].label}
              </Link>
            )
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${CHIP[item.estado_efectivo]}`}>
            {CHIP_TXT[item.estado_efectivo]}
          </span>
          {!bloqueado && (
            <div className="flex items-center gap-1">
              {esAuto ? (
                item.estado_efectivo === "na" ? (
                  <button onClick={() => marcar("pendiente")} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50">
                    Incluir
                  </button>
                ) : (
                  <button onClick={() => marcar("na")} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50">
                    No aplica
                  </button>
                )
              ) : (
                <>
                  {item.estado_manual !== "listo" && (
                    <button onClick={() => marcar("listo")} disabled={pending} className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white hover:bg-neutral-800">
                      Marcar listo
                    </button>
                  )}
                  {item.estado_manual !== "pendiente" && (
                    <button onClick={() => marcar("pendiente")} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50">
                      Pendiente
                    </button>
                  )}
                  {item.estado_manual !== "na" && (
                    <button onClick={() => marcar("na")} disabled={pending} className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50">
                      N/A
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Archivos (o importación de retiros) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {esRetiros || esRetirosDep ? (
          !bloqueado && (
            <label className="cursor-pointer rounded-md border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
              {pending
                ? esRetirosDep ? "Leyendo PDF…" : "Leyendo Excel…"
                : esRetirosDep ? "Importar PDF de retiros" : "Importar Excel de retiros"}
              <input ref={fileRef} type="file" accept={esRetirosDep ? ".pdf" : ".xlsx,.xls"} onChange={onFile} disabled={pending} className="hidden" />
            </label>
          )
        ) : (
          <>
            {archivos.map((a) => (
              <span key={a.id} className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs">
                <a href={`/cierre/archivo/${a.id}`} target="_blank" rel="noopener" className="text-neutral-700 underline hover:text-neutral-900">
                  {a.nombre}
                </a>
                {!bloqueado && (
                  <button
                    onClick={() => run(() => anularArchivo(a.id))}
                    disabled={pending}
                    title="Quitar"
                    className="text-neutral-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {!bloqueado && (
              <label className="cursor-pointer rounded-md border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
                {pending ? "Subiendo…" : "+ Subir archivo"}
                <input ref={fileRef} type="file" onChange={onFile} disabled={pending} className="hidden" />
              </label>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {ok && <p className="mt-1 text-xs text-green-700">{ok}</p>}
    </div>
  );
}
