import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerInsumoManual, listarFuentesReceta, usoInsumoEnRecetas } from "@/lib/data/recetas";
import ConvertirInsumoForm from "@/components/ConvertirInsumoForm";
import { convertirInsumo } from "../../../actions";

export default async function ConvertirInsumoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");
  const { id } = await params;

  const [insumo, fuentes, uso] = await Promise.all([
    obtenerInsumoManual(id),
    listarFuentesReceta(),
    usoInsumoEnRecetas(id),
  ]);
  if (!insumo) notFound();

  const articulos = fuentes
    .filter((f) => f.tipo === "articulo")
    .map((f) => ({ ref_id: f.ref_id, nombre: f.nombre, cpb: f.cpb, unidad_natural: f.unidad_natural }));

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Convertir insumo a artículo</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Ligá este insumo manual a un artículo del inventario para que sus recetas usen el costo real
        (promedio ponderado) en lugar del costo a mano.
      </p>
      <ConvertirInsumoForm action={convertirInsumo} insumo={insumo} articulos={articulos} uso={uso} />
    </div>
  );
}
