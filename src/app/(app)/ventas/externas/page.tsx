import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import { listarClientesExt, ventasExtMes } from "@/lib/data/ventasExternas";
import { listarRetirosExt, cxpPendientes, planillasPendientes } from "@/lib/data/cierre";
import { listarCuentasDeGastos } from "@/lib/data/gastos";
import VentasExtGrid from "@/components/VentasExtGrid";
import ImportarVentasExt from "@/components/ImportarVentasExt";
import RetirosCajaPanel from "@/components/RetirosCajaPanel";

const money = (n: number) => "₡" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

type SP = { anio?: string; mes?: string };

export default async function VentasExternasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/");
  const sp = await searchParams;
  const hoy = new Date();
  const anio = Number(sp.anio) || hoy.getFullYear();
  const mes = Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : hoy.getMonth() + 1;

  const supabase = await createClient();
  const [clientes, celdas, salidas, cuentasGasto, cxp, planillas, cajasRes, centrosRes, ingresoRes] =
    await Promise.all([
      listarClientesExt(),
      ventasExtMes(anio, mes),
      listarRetirosExt(anio, mes),
      listarCuentasDeGastos(),
      cxpPendientes(),
      planillasPendientes(),
      supabase
        .from("cuentas")
        .select("id, codigo, nombre")
        .like("codigo", "11-10-10-%")
        .eq("acepta_movimiento", true)
        .eq("estado", "activo")
        .order("codigo"),
      supabase.from("centros_costo").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      supabase
        .from("cuentas")
        .select("id, codigo, nombre")
        .eq("tipo", "ingreso")
        .eq("acepta_movimiento", true)
        .eq("estado", "activo")
        .order("codigo"),
    ]);
  const activos = clientes.filter((c) => c.activo);
  const cuentasCaja = (cajasRes.data ?? []) as { id: string; codigo: string; nombre: string }[];
  const centros = (centrosRes.data ?? []) as { id: string; codigo: string; nombre: string }[];
  const cuentasIngreso = (ingresoRes.data ?? []) as { id: string; codigo: string; nombre: string }[];

  const totVentas = celdas.reduce((s, c) => s + c.monto, 0);
  const totSalidas = salidas.filter((r) => r.estado !== "na").reduce((s, r) => s + r.monto, 0);
  const neto = totVentas - totSalidas;

  const prev = mes === 1 ? { a: anio - 1, m: 12 } : { a: anio, m: mes - 1 };
  const next = mes === 12 ? { a: anio + 1, m: 1 } : { a: anio, m: mes + 1 };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/ventas" className="text-sm text-neutral-500 hover:text-neutral-900">
              ← Ventas
            </Link>
          </div>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">Ventas externas / mayoreo</h1>
          <p className="text-sm text-neutral-500">
            Control manual de lo que compra cada cliente externo por día. No afecta la contabilidad.
          </p>
        </div>
        <ImportarVentasExt anio={anio} mes={mes} />
      </div>

      {/* Selector de mes */}
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/ventas/externas?anio=${prev.a}&mes=${prev.m}`} className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50">
          ←
        </Link>
        <span className="min-w-[140px] text-center text-sm font-semibold text-neutral-900">
          {MESES[mes]} {anio}
        </span>
        <Link href={`/ventas/externas?anio=${next.a}&mes=${next.m}`} className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50">
          →
        </Link>
      </div>

      {/* Resumen del mes */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Ventas</div>
          <div className="text-lg font-semibold tabular-nums text-green-700">{money(totVentas)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Salidas</div>
          <div className="text-lg font-semibold tabular-nums text-red-600">{money(totSalidas)}</div>
        </div>
        <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          <div className="text-xs text-neutral-500">Neto (ventas − salidas)</div>
          <div className={`text-lg font-bold tabular-nums ${neto >= 0 ? "text-neutral-900" : "text-red-700"}`}>
            {money(neto)}
          </div>
        </div>
      </div>

      <VentasExtGrid key={`grid-${anio}-${mes}`} anio={anio} mes={mes} clientes={activos} celdas={celdas} />

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-800">Salidas del mes</h2>
        <RetirosCajaPanel
          key={`sal-${anio}-${mes}`}
          retiros={salidas}
          centroId=""
          centroCodigo=""
          anio={anio}
          mes={mes}
          cuentasGasto={cuentasGasto}
          cuentasCaja={cuentasCaja}
          cxp={cxp}
          centros={centros}
          cuentasIngreso={cuentasIngreso}
          planillas={planillas}
          permiteManual
        />
      </div>
    </div>
  );
}
