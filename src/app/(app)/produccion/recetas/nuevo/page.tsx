import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFuentesReceta } from "@/lib/data/recetas";
import RecetaForm from "@/components/RecetaForm";
import { guardarReceta } from "../../actions";

export default async function NuevaRecetaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");
  const { tipo } = await searchParams;
  const esProducto = tipo !== "intermedia"; // por defecto, producto final
  const fuentes = await listarFuentesReceta();

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">
        Nuevo {esProducto ? "producto" : "receta intermedia"}
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Armá la ficha con sus ingredientes. El costo se calcula en vivo según el inventario y los insumos.
      </p>
      <RecetaForm modo="crear" action={guardarReceta} fuentes={fuentes} esProductoDefault={esProducto} />
    </div>
  );
}
