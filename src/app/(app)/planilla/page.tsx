import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPlanillas } from "@/lib/data/planilla";
import PlanillaImportar from "@/components/PlanillaImportar";
import PlanillasTabla from "@/components/PlanillasTabla";

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

type SP = { q?: string; estado?: string; provision?: string; pago?: string };

export default async function PlanillaPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const sp = await searchParams;
  const todas = await listarPlanillas();

  const estado = ["borrador", "confirmada", "anulada"].includes(sp.estado ?? "") ? sp.estado : "";
  const provision = ["posteada", "pendiente"].includes(sp.provision ?? "") ? sp.provision : "";
  const pago = ["pagada", "sin"].includes(sp.pago ?? "") ? sp.pago : "";
  const q = (sp.q ?? "").trim().toLowerCase();
  const hayFiltro = !!(estado || provision || pago || q);

  const planillas = todas.filter((p) => {
    if (estado && p.estado !== estado) return false;
    if (provision === "posteada" && !p.posteada) return false;
    if (provision === "pendiente" && p.posteada) return false;
    if (pago === "pagada" && !p.pagada) return false;
    if (pago === "sin" && p.pagada) return false;
    if (q && !(p.titulo ?? "").toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-neutral-900">Planilla</h1>
        <p className="text-sm text-neutral-500">
          Importá el CSV de la app de planilla, asigná el centro de cada colaborador y posteá la provisión y el pago.
        </p>
      </div>

      {todas.length > 0 && (
        <>
          {/* Filtros */}
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Buscar título
              <input type="text" name="q" defaultValue={sp.q ?? ""} placeholder="ej. Agosto" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Estado
              <select name="estado" defaultValue={estado ?? ""} className={inputCls}>
                <option value="">Todos</option>
                <option value="confirmada">Confirmada</option>
                <option value="borrador">Borrador</option>
                <option value="anulada">Anulada</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Provisión
              <select name="provision" defaultValue={provision ?? ""} className={inputCls}>
                <option value="">Todas</option>
                <option value="posteada">Posteada</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Pago
              <select name="pago" defaultValue={pago ?? ""} className={inputCls}>
                <option value="">Todos</option>
                <option value="pagada">Pagada</option>
                <option value="sin">Sin pagar</option>
              </select>
            </label>
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              Filtrar
            </button>
            {hayFiltro && (
              <Link href="/planilla" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
                Limpiar
              </Link>
            )}
          </form>

          <div className="mb-6">
            <PlanillasTabla planillas={planillas} />
          </div>
        </>
      )}

      <div className="mb-2 text-sm font-semibold text-neutral-800">Nueva planilla</div>
      <PlanillaImportar />
    </div>
  );
}
