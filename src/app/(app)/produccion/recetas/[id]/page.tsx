import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerReceta, listarFuentesReceta } from "@/lib/data/recetas";
import RecetaForm from "@/components/RecetaForm";
import { guardarReceta } from "../../actions";

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");
  const { id } = await params;
  const [receta, fuentes] = await Promise.all([obtenerReceta(id), listarFuentesReceta(id)]);
  if (!receta) notFound();

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">
        Editar {receta.es_producto ? "producto" : "receta"} — {receta.nombre}
      </h1>
      <RecetaForm modo="editar" action={guardarReceta} fuentes={fuentes} inicial={receta} />
    </div>
  );
}
