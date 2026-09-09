"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import type { VentaDiaListado } from "@/lib/data/ventas";

const money = (n: number) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default function VentasTabla({ ventas }: { ventas: VentaDiaListado[] }) {
  const columnas: ColumnaTabla<VentaDiaListado>[] = [
    {
      key: "fecha",
      titulo: "Fecha",
      grupo: (v) => fechaCR(v.fecha),
      celda: (v) => <span className="text-neutral-600">{fechaCR(v.fecha)}</span>,
    },
    {
      key: "negocio",
      titulo: "Negocio",
      grupo: (v) => v.centro_codigo ?? "—",
      celda: (v) => <span className="text-neutral-800">{v.centro_codigo ?? "—"}</span>,
    },
    { key: "mes", titulo: "Mes", soloGrupo: true, grupo: (v) => v.fecha.slice(0, 7), celda: () => null },
    { key: "anio", titulo: "Año", soloGrupo: true, grupo: (v) => v.fecha.slice(0, 4), celda: () => null },
    // Los subtotales excluyen las anuladas (la fila igual muestra su monto real).
    { key: "gravado", titulo: "Gravado", align: "right", monto: (v) => (v.estado === "anulado" ? 0 : v.gravado), celda: (v) => <span className="text-neutral-600">{money(v.gravado)}</span> },
    { key: "exento", titulo: "Exento", align: "right", monto: (v) => (v.estado === "anulado" ? 0 : v.exento), celda: (v) => <span className="text-neutral-600">{money(v.exento)}</span> },
    { key: "iva", titulo: "IVA", align: "right", monto: (v) => (v.estado === "anulado" ? 0 : v.iva), celda: (v) => <span className="text-neutral-600">{money(v.iva)}</span> },
    { key: "total", titulo: "Total", align: "right", monto: (v) => (v.estado === "anulado" ? 0 : v.total), celda: (v) => <span className="font-medium text-neutral-900">{money(v.total)}</span> },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (v) => v.estado,
      celda: (v) => <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[v.estado]}`}>{v.estado}</span>,
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (v) => (
        <Link href={`/ventas/${v.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={ventas}
      columnas={columnas}
      claveFila={(v) => v.id}
      minWidth="min-w-[820px]"
      vacio="Ninguna venta con esos filtros."
    />
  );
}
