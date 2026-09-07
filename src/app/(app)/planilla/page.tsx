import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPlanillas } from "@/lib/data/planilla";
import PlanillaImportar from "@/components/PlanillaImportar";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function PlanillaPage() {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const planillas = await listarPlanillas();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-neutral-900">Planilla</h1>
        <p className="text-sm text-neutral-500">
          Importá el CSV de la app de planilla, asigná el centro de cada colaborador y posteá la provisión y el pago.
        </p>
      </div>

      {planillas.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
            Planillas
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-4 py-2 text-right font-medium">Colab.</th>
                <th className="px-4 py-2 text-right font-medium">Neto</th>
                <th className="px-4 py-2 font-medium">Provisión</th>
                <th className="px-4 py-2 font-medium">Pago</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {planillas.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-neutral-600">{fechaCR(p.fecha)}</td>
                  <td className="px-4 py-2 text-neutral-800">{p.titulo ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{p.n_colaboradores}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-900">₡{fmt(p.neto)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.posteada ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {p.posteada ? "posteada" : "pendiente"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.pagada ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {p.pagada ? "pagada" : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[p.estado]}`}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/planilla/${p.id}`} className="text-neutral-600 hover:text-neutral-900">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-2 text-sm font-semibold text-neutral-800">Nueva planilla</div>
      <PlanillaImportar />
    </div>
  );
}
