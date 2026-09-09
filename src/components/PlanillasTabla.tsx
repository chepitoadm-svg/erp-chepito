"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import type { PlanillaListado } from "@/lib/data/planilla";

const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colones = (n: number) => "₡" + money(n);

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default function PlanillasTabla({ planillas }: { planillas: PlanillaListado[] }) {
  const columnas: ColumnaTabla<PlanillaListado>[] = [
    {
      key: "fecha",
      titulo: "Fecha",
      grupo: (p) => fechaCR(p.fecha),
      celda: (p) => <span className="text-neutral-600">{fechaCR(p.fecha)}</span>,
    },
    {
      key: "titulo",
      titulo: "Título",
      grupo: (p) => p.titulo ?? "—",
      celda: (p) => <span className="text-neutral-800">{p.titulo ?? "—"}</span>,
    },
    { key: "mes", titulo: "Mes", soloGrupo: true, grupo: (p) => p.fecha.slice(0, 7), celda: () => null },
    { key: "anio", titulo: "Año", soloGrupo: true, grupo: (p) => p.fecha.slice(0, 4), celda: () => null },
    {
      key: "colab",
      titulo: "Colab.",
      align: "right",
      celda: (p) => <span className="tabular-nums text-neutral-600">{p.n_colaboradores}</span>,
    },
    {
      key: "neto",
      titulo: "Neto",
      align: "right",
      monto: (p) => p.neto,
      fmt: colones,
      celda: (p) => <span className="font-medium text-neutral-900">{colones(p.neto)}</span>,
    },
    {
      key: "provision",
      titulo: "Provisión",
      grupo: (p) => (p.posteada ? "posteada" : "pendiente"),
      celda: (p) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${p.posteada ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
          {p.posteada ? "posteada" : "pendiente"}
        </span>
      ),
    },
    {
      key: "pago",
      titulo: "Pago",
      grupo: (p) => (p.pagada ? "pagada" : "sin pagar"),
      celda: (p) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${p.pagada ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
          {p.pagada ? "pagada" : "—"}
        </span>
      ),
    },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (p) => p.estado,
      celda: (p) => <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[p.estado]}`}>{p.estado}</span>,
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (p) => (
        <Link href={`/planilla/${p.id}`} className="text-neutral-600 hover:text-neutral-900">
          Ver
        </Link>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={planillas}
      columnas={columnas}
      claveFila={(p) => p.id}
      minWidth="min-w-[720px]"
      vacio="Ninguna planilla con esos filtros."
    />
  );
}
