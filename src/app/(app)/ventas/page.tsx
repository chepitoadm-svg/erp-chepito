import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarVentasDia, listarCentrosDeVentas } from "@/lib/data/ventas";
import VentasTabla from "@/components/VentasTabla";

type SP = {
  centro?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
};

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

export default async function VentasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/");
  const sp = await searchParams;
  const filtro = {
    centro: sp.centro || undefined,
    estado: sp.estado || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
  };
  const [ventas, centros] = await Promise.all([listarVentasDia(filtro), listarCentrosDeVentas()]);

  const hayFiltro = !!(sp.centro || sp.estado || sp.desde || sp.hasta);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Ventas del día</h1>
          <p className="text-sm text-neutral-500">
            Lo vendido por negocio (gravado, exento e IVA). Postea la venta al mayor por centro de
            costo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ventas/externas"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Ventas externas
          </Link>
          <Link
            href="/ventas/importar"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Importar de QuPOS
          </Link>
          <Link
            href="/ventas/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nueva venta
          </Link>
        </div>
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
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="confirmado">Confirmado</option>
            <option value="anulado">Anulado</option>
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
          <Link href="/ventas" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      {ventas.length === 0 && !hayFiltro ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Todavía no hay ventas registradas.
        </div>
      ) : (
        <VentasTabla ventas={ventas} />
      )}
      {ventas.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400">Los totales excluyen las ventas anuladas.</p>
      )}
    </div>
  );
}
