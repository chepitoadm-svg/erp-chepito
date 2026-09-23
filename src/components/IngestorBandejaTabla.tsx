"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import type { IngestaListado } from "@/lib/data/compras";

const money = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  recibido: "bg-neutral-100 text-neutral-600",
  validado: "bg-blue-50 text-blue-700",
  requiere_mapeo: "bg-amber-50 text-amber-700",
  procesado: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
  descartado: "bg-neutral-100 text-neutral-400",
};
const ESTADO_LBL: Record<string, string> = {
  recibido: "recibido",
  validado: "listo para crear",
  requiere_mapeo: "requiere mapeo",
  procesado: "factura creada",
  error: "error",
  descartado: "descartado",
};

export default function IngestorBandejaTabla({ comprobantes }: { comprobantes: IngestaListado[] }) {
  const columnas: ColumnaTabla<IngestaListado>[] = [
    {
      key: "emision",
      titulo: "Emisión",
      grupo: (c) => fechaCR(c.fecha_emision ?? "") || "—",
      orden: (c) => c.fecha_emision ?? "",
      celda: (c) => <span className="text-neutral-600">{fechaCR(c.fecha_emision ?? "") || "—"}</span>,
    },
    { key: "mes", titulo: "Mes", soloGrupo: true, grupo: (c) => (c.fecha_emision ?? "—").slice(0, 7), celda: () => null },
    { key: "anio", titulo: "Año", soloGrupo: true, grupo: (c) => (c.fecha_emision ?? "—").slice(0, 4), celda: () => null },
    {
      key: "emisor",
      titulo: "Emisor",
      th: "max-w-[240px]",
      grupo: (c) => c.emisor_nombre ?? "—",
      celda: (c) => (
        <span className="block max-w-[240px] truncate text-neutral-900" title={c.emisor_nombre ?? ""}>
          {c.emisor_nombre ?? "—"}
        </span>
      ),
    },
    {
      key: "proveedor",
      titulo: "Proveedor",
      th: "max-w-[220px]",
      grupo: (c) => c.proveedor_nombre ?? "sin registrar",
      celda: (c) =>
        c.proveedor_nombre ? (
          <span className="block max-w-[220px] truncate text-neutral-600" title={c.proveedor_nombre}>
            {c.proveedor_nombre}
          </span>
        ) : (
          <span className="text-red-600">sin registrar</span>
        ),
    },
    {
      key: "total",
      titulo: "Total",
      align: "right",
      monto: (c) => Number(c.total ?? 0),
      celda: (c) => <span className="tabular-nums text-neutral-900">{money(c.total)}</span>,
    },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (c) => ESTADO_LBL[c.estado] ?? c.estado,
      celda: (c) => (
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>
            {ESTADO_LBL[c.estado] ?? c.estado}
          </span>
          {c.ya_ingresada && c.estado !== "procesado" && c.estado !== "descartado" && (
            <span
              className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"
              title="Ya existe una factura con este consecutivo. No la creés de nuevo: descartala."
            >
              ya ingresada
            </span>
          )}
        </div>
      ),
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (c) => (
        <Link href={`/compras/ingestor/${c.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={comprobantes}
      columnas={columnas}
      claveFila={(c) => c.id}
      minWidth="min-w-[820px]"
      persistKey="compras-ingestor"
      vacio="Todavía no se subió ningún comprobante."
    />
  );
}
