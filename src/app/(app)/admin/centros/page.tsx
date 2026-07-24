import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosCostoAdmin } from "@/lib/data/admin";
import CentroCostoForm from "@/components/CentroCostoForm";
import { alternarCentroActivo } from "../actions";

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
              <tr key={c.id} className={c.activo ? "" : "opacity-50"}>
                <td className="px-4 py-3 font-medium text-neutral-900">{c.codigo}</td>
                <td className="px-4 py-3 text-neutral-700">{c.nombre}</td>
                <td className="px-4 py-3 capitalize text-neutral-600">{c.tipo}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {c.tipo === "intermedio" ? (c.requiere_prorrateo ? "Sí" : "No") : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.activo ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {c.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={alternarCentroActivo} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="activo" value={String(c.activo)} />
                    <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-900">
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
