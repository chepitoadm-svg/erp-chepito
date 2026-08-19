import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import CostoMesForm from "@/components/CostoMesForm";

export default async function NuevoCostoPage() {
  if (!(await tienePermiso("costos.registrar"))) redirect("/costos");
  // Mes anterior por defecto (normalmente se costea el mes ya cerrado).
  const hoy = new Date();
  const anterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
  const mesActual = anterior.toISOString().slice(0, 7);

  return (
    <div>
      <Link href="/costos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Costo de ventas
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Calcular costo del mes</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Elegí el mes y el ERP calcula el costo de la materia prima consumida por cada panadería (de
        la producción registrada en el app). Al confirmar postea el costo de ventas por centro contra
        el inventario.
      </p>
      <CostoMesForm mesActual={mesActual} />
    </div>
  );
}
