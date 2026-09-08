"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import { numeroFactura } from "@/lib/compras/numeroFactura";
import type { FacturaListado } from "@/lib/data/compras";

const money = (n: number) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};
const PAGO_CLS: Record<string, string> = {
  pagada: "bg-green-50 text-green-700",
  vencida: "bg-red-50 text-red-700",
  pendiente: "bg-amber-50 text-amber-700",
  na: "bg-neutral-100 text-neutral-400",
};
const PAGO_LBL: Record<string, string> = {
  pagada: "Pagada",
  vencida: "Vencida",
  pendiente: "Pendiente",
  na: "—",
};

// Los subtotales no cuentan las anuladas (la fila igual muestra su monto real).
const vivo = (f: FacturaListado, n: number) => (f.estado === "anulada" ? 0 : n);

export default function ComprasFacturasTabla({ facturas }: { facturas: FacturaListado[] }) {
  const columnas: ColumnaTabla<FacturaListado>[] = [
    {
      key: "emision",
      titulo: "Emisión",
      grupo: (f) => fechaCR(f.fecha_emision),
      celda: (f) => <span className="text-neutral-600">{fechaCR(f.fecha_emision)}</span>,
    },
    {
      key: "vence",
      titulo: "Vence",
      celda: (f) => (
        <span className={f.pago === "vencida" ? "font-medium text-red-600" : "text-neutral-500"}>
          {fechaCR(f.fecha_vencimiento ?? "") || "—"}
        </span>
      ),
    },
    {
      key: "proveedor",
      titulo: "Proveedor",
      grupo: (f) => f.proveedor_nombre || "—",
      celda: (f) => <span className="text-neutral-900">{f.proveedor_nombre}</span>,
    },
    {
      key: "factura",
      titulo: "Factura",
      celda: (f) => <span className="font-mono text-xs text-neutral-500">{numeroFactura(f.clave ?? "") ?? "—"}</span>,
    },
    {
      key: "centro",
      titulo: "Centro",
      grupo: (f) => f.centro_codigo ?? "— inventario",
      celda: (f) =>
        f.centro_codigo ? (
          <span className="text-neutral-600" title={f.centro_nombre ?? ""}>
            {f.centro_codigo}
          </span>
        ) : (
          <span className="text-neutral-300">— inventario</span>
        ),
    },
    {
      key: "lineas",
      titulo: "Líneas",
      align: "right",
      celda: (f) => <span className="tabular-nums text-neutral-600">{f.n_lineas}</span>,
    },
    {
      key: "subtotal",
      titulo: "Base",
      align: "right",
      monto: (f) => vivo(f, f.subtotal),
      celda: (f) => <span className="tabular-nums text-neutral-600">{money(f.subtotal)}</span>,
    },
    {
      key: "iva",
      titulo: "IVA",
      align: "right",
      monto: (f) => vivo(f, f.iva),
      celda: (f) => <span className="tabular-nums text-neutral-600">{money(f.iva)}</span>,
    },
    {
      key: "total",
      titulo: "Total",
      align: "right",
      monto: (f) => vivo(f, f.total),
      celda: (f) => <span className="tabular-nums font-medium text-neutral-900">{money(f.total)}</span>,
    },
    {
      key: "pago",
      titulo: "Pago",
      grupo: (f) => PAGO_LBL[f.pago],
      celda: (f) => (
        <div className="flex flex-col gap-0.5">
          <span className={`w-fit rounded-full px-2 py-0.5 text-xs ${PAGO_CLS[f.pago]}`}>{PAGO_LBL[f.pago]}</span>
          {f.pago_ids.length > 0 && (
            <Link
              href={f.pago_ids.length === 1 ? `/compras/pagos/${f.pago_ids[0]}` : `/compras/facturas/${f.id}`}
              className="text-xs text-neutral-500 underline hover:text-neutral-900"
            >
              ver pago{f.pago_ids.length > 1 ? "s" : ""}
            </Link>
          )}
          {f.pago === "vencida" && f.cxp_saldo != null && (
            <span className="text-xs text-red-500">debe ₡{money(f.cxp_saldo)}</span>
          )}
        </div>
      ),
    },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (f) => f.estado,
      celda: (f) => <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[f.estado]}`}>{f.estado}</span>,
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (f) => (
        <Link href={`/compras/facturas/${f.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={facturas}
      columnas={columnas}
      claveFila={(f) => f.id}
      minWidth="min-w-[980px]"
      vacio="Ninguna factura coincide con los filtros."
    />
  );
}
