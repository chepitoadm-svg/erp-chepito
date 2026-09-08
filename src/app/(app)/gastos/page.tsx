import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarGastos,
  listarCentrosDeGastos,
  listarCuentasDeGastos,
  listarCuentasPagoGasto,
} from "@/lib/data/gastos";
import GastosTabla from "@/components/GastosTabla";

type SP = {
  centro?: string;
  cuenta?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pago?: string;
};

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

export default async function GastosPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const sp = await searchParams;
  const filtro = {
    centro: sp.centro || undefined,
    cuenta: sp.cuenta || undefined,
    estado: sp.estado || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
  };
  const [gastosTodos, centros, cuentas, cuentasPagoRaw] = await Promise.all([
    listarGastos(filtro),
    listarCentrosDeGastos(),
    listarCuentasDeGastos(),
    listarCuentasPagoGasto(),
  ]);
  const cuentasPago = cuentasPagoRaw.pagado_con;
  const hoy = new Date().toISOString().slice(0, 10);
  const pagoFiltro = sp.pago && ["pagada", "vencida", "pendiente"].includes(sp.pago) ? sp.pago : "";
  const gastos = pagoFiltro ? gastosTodos.filter((g) => g.pago === pagoFiltro) : gastosTodos;

  const hayFiltro = !!(sp.centro || sp.cuenta || sp.estado || sp.desde || sp.hasta || pagoFiltro);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Gastos</h1>
          <p className="text-sm text-neutral-500">
            Gastos del mes por centro de costo (alquiler, servicios, planilla, caja chica…). Alimenta el Estado de
            Resultados por panadería.
          </p>
        </div>
        <Link
          href="/gastos/nuevo"
          className="whitespace-nowrap rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo gasto
        </Link>
      </div>

      {/* Filtros */}
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Centro
          <select name="centro" defaultValue={sp.centro ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Cuenta
          <select name="cuenta" defaultValue={sp.cuenta ?? ""} className={inputCls}>
            <option value="">Todas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Pago
          <select name="pago" defaultValue={sp.pago ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencida">Vencida</option>
            <option value="pagada">Pagado</option>
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
          <Link href="/gastos" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      {gastos.length === 0 && !hayFiltro ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Todavía no hay gastos registrados.
        </div>
      ) : (
        <GastosTabla gastos={gastos} cuentasPago={cuentasPago} hoy={hoy} />
      )}
    </div>
  );
}
