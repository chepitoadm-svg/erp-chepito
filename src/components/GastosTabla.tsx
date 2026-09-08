"use client";

import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import TablaAgrupable, { type ColumnaTabla } from "@/components/TablaAgrupable";
import PagarGastoBtn from "@/components/PagarGastoBtn";
import type { GastoListado } from "@/lib/data/gastos";

const money = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};
const PAGO_CLS: Record<string, string> = {
  pagada: "bg-green-50 text-green-700",
  vencida: "bg-red-50 text-red-700",
  pendiente: "bg-amber-50 text-amber-700",
  na: "bg-neutral-100 text-neutral-400",
};
const PAGO_LBL: Record<string, string> = {
  pagada: "Pagado",
  vencida: "Vencida",
  pendiente: "Pendiente",
  na: "—",
};

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
}

export default function GastosTabla({
  gastos,
  cuentasPago,
  hoy,
}: {
  gastos: GastoListado[];
  cuentasPago: Cuenta[];
  hoy: string;
}) {
  const columnas: ColumnaTabla<GastoListado>[] = [
    {
      key: "fecha",
      titulo: "Fecha",
      grupo: (g) => fechaCR(g.fecha),
      celda: (g) => <span className="text-neutral-600">{fechaCR(g.fecha)}</span>,
    },
    {
      key: "centro",
      titulo: "Centro",
      grupo: (g) => g.centro_codigo ?? "—",
      celda: (g) => <span className="text-neutral-800">{g.centro_codigo ?? "—"}</span>,
    },
    {
      key: "cuenta",
      titulo: "Cuenta",
      grupo: (g) => (g.cuenta_codigo ? `${g.cuenta_codigo} · ${g.cuenta_nombre}` : "—"),
      celda: (g) => (
        <span className="text-neutral-600">{g.cuenta_codigo ? `${g.cuenta_codigo} · ${g.cuenta_nombre}` : "—"}</span>
      ),
    },
    {
      key: "descripcion",
      titulo: "Descripción",
      celda: (g) => <span className="text-neutral-500">{g.descripcion ?? "—"}</span>,
    },
    {
      key: "total",
      titulo: "Total",
      align: "right",
      monto: (g) => g.total,
      celda: (g) => <span className="font-medium text-neutral-900">{money(g.total)}</span>,
    },
    {
      key: "pago",
      titulo: "Pago",
      grupo: (g) => PAGO_LBL[g.pago],
      celda: (g) => (
        <div className="flex flex-col gap-0.5">
          <span className={`w-fit rounded-full px-2 py-0.5 text-xs ${PAGO_CLS[g.pago]}`}>{PAGO_LBL[g.pago]}</span>
          {g.pago_ids.length > 0 && (
            <Link
              href={g.pago_ids.length === 1 ? `/compras/pagos/${g.pago_ids[0]}` : `/gastos/${g.id}`}
              className="text-xs text-neutral-500 underline hover:text-neutral-900"
            >
              ver pago{g.pago_ids.length > 1 ? "s" : ""}
            </Link>
          )}
          {g.pago === "vencida" && g.cxp_saldo != null && (
            <span className="text-xs text-red-500">debe ₡{money(g.cxp_saldo)}</span>
          )}
        </div>
      ),
    },
    {
      key: "estado",
      titulo: "Estado",
      grupo: (g) => g.estado,
      celda: (g) => <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[g.estado]}`}>{g.estado}</span>,
    },
    {
      key: "acciones",
      titulo: "",
      align: "right",
      celda: (g) => (
        <div className="flex items-center justify-end gap-3">
          {(g.pago === "pendiente" || g.pago === "vencida") && g.cxp_saldo != null && (
            <PagarGastoBtn gastoId={g.id} saldo={g.cxp_saldo} cuentas={cuentasPago} fechaDefault={hoy} />
          )}
          <Link href={`/gastos/${g.id}`} className="text-neutral-600 hover:text-neutral-900">
            Ver
          </Link>
        </div>
      ),
    },
  ];

  return (
    <TablaAgrupable
      filas={gastos}
      columnas={columnas}
      claveFila={(g) => g.id}
      minWidth="min-w-[900px]"
      vacio="Ningún gasto con esos filtros."
    />
  );
}
