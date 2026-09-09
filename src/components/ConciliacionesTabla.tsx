"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import type { ConciliacionListado } from "@/lib/data/conciliaciones";

const money = (n: number) => Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  conciliada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default function ConciliacionesTabla({ filas }: { filas: ConciliacionListado[] }) {
  const columnas: ColumnaTabla<ConciliacionListado>[] = [
    {
      key: "corte",
      titulo: "Corte",
      grupo: (c) => fechaCR(c.fecha_corte),
      celda: (c) => <span className="text-neutral-600">{fechaCR(c.fecha_corte)}</span>,
    },
    { key: "mes", titulo: "Mes", soloGrupo: true, grupo: (c) => c.fecha_corte.slice(0, 7), celda: () => null },
    { key: "anio", titulo: "Año", soloGrupo: true, grupo: (c) => c.fecha_corte.slice(0, 4), celda: () => null },
    {
      key: "cuenta",
      titulo: "Cuenta",
      grupo: (c) => (c.cuenta_codigo ? `${c.cuenta_codigo} · ${c.cuenta_nombre}` : "—"),
      celda: (c) => (
        <span className="text-neutral-800">{c.cuenta_codigo ? `${c.cuenta_codigo} · ${c.cuenta_nombre}` : "—"}</span>
      ),
    },
    {
      key: "saldo",
      titulo: "Saldo banco",
      align: "right",
      monto: (c) => c.saldo_final,
      celda: (c) => <span className="font-medium text-neutral-900">{money(c.saldo_final)}</span>,
    },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (c) => c.estado,
      celda: (c) => <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>{c.estado}</span>,
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (c) => (
        <Link href={`/tesoreria/conciliaciones/${c.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={filas}
      columnas={columnas}
      claveFila={(c) => c.id}
      minWidth="min-w-[560px]"
      vacio="Ninguna conciliación con esos filtros."
    />
  );
}
