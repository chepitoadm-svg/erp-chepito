import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import InsumoManualForm from "@/components/InsumoManualForm";
import { crearInsumoManual } from "../../actions";

export default async function NuevoInsumoPage() {
  if (!(await tienePermiso("produccion.gestionar"))) redirect("/produccion");

  return (
    <div>
      <Link href="/produccion" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Producción
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nuevo insumo manual</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Materia prima con costo a mano, para lo que todavía no está en el inventario.
      </p>
      <InsumoManualForm modo="crear" action={crearInsumoManual} />
    </div>
  );
}
