import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerInsumoManual } from "@/lib/data/recetas";
import InsumoManualForm from "@/components/InsumoManualForm";
import { editarInsumoManual } from "../../actions";

export default async function EditarInsumoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");
  const { id } = await params;
  const insumo = await obtenerInsumoManual(id);
  if (!insumo) notFound();

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">
        Editar insumo — {insumo.nombre}
      </h1>
      <InsumoManualForm modo="editar" action={editarInsumoManual} inicial={insumo} />
    </div>
  );
}
