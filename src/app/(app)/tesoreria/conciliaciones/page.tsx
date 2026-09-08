import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarConciliaciones } from "@/lib/data/conciliaciones";
import ConciliacionesTabla from "@/components/ConciliacionesTabla";

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

type SP = { cuenta?: string; estado?: string; desde?: string; hasta?: string };

export default async function ConciliacionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/");
  const sp = await searchParams;
  const todas = await listarConciliaciones();

  // Cuentas presentes, para el filtro (por código).
  const cuentas = Array.from(
    new Map(todas.map((c) => [c.cuenta_codigo ?? "", c.cuenta_nombre ?? ""])).entries(),
  )
    .filter(([cod]) => cod)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const estado = ["borrador", "conciliada", "anulada"].includes(sp.estado ?? "") ? sp.estado : "";
  const hayFiltro = !!(sp.cuenta || estado || sp.desde || sp.hasta);

  const cs = todas.filter((c) => {
    if (sp.cuenta && c.cuenta_codigo !== sp.cuenta) return false;
    if (estado && c.estado !== estado) return false;
    if (sp.desde && c.fecha_corte < sp.desde) return false;
    if (sp.hasta && c.fecha_corte > sp.hasta) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Conciliaciones bancarias</h1>
          <p className="text-sm text-neutral-500">
            Amarra los movimientos de libros contra el estado de cuenta real del banco.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tesoreria/datafono" className="text-sm text-neutral-500 hover:text-neutral-900">
            💳 Liquidación datafono
          </Link>
          <Link href="/tesoreria/proveedores-banco" className="text-sm text-neutral-500 hover:text-neutral-900">
            🏷️ Proveedores por cuenta
          </Link>
          <Link
            href="/tesoreria/conciliaciones/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nueva conciliación
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Cuenta
          <select name="cuenta" defaultValue={sp.cuenta ?? ""} className={inputCls}>
            <option value="">Todas</option>
            {cuentas.map(([cod, nom]) => (
              <option key={cod} value={cod}>
                {cod} · {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado
          <select name="estado" defaultValue={estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="conciliada">Conciliada</option>
            <option value="anulada">Anulada</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Corte desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Corte hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={inputCls} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {hayFiltro && (
          <Link href="/tesoreria/conciliaciones" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      {cs.length === 0 && !hayFiltro ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Todavía no hay conciliaciones.
        </div>
      ) : (
        <ConciliacionesTabla filas={cs} />
      )}
    </div>
  );
}
