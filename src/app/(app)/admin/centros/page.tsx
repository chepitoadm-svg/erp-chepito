import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosCostoAdmin } from "@/lib/data/admin";
import CentroCostoForm from "@/components/CentroCostoForm";
import CentroRow from "@/components/CentroRow";

export default async function CentrosPage() {
  if (!(await tienePermiso("centros.gestionar"))) redirect("/admin");

  const centros = await listarCentrosCostoAdmin();

  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Administración
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Centros de costo</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Finales = canales del Estado de Resultados. Intermedios = pools que se
        reparten. Agregar uno es un alta, sin cambios de esquema.
      </p>

      <div className="mb-6">
        <CentroCostoForm />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Prorrateo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {centros.map((c) => (
              <CentroRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
