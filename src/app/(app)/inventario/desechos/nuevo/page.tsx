import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosFinales } from "@/lib/data/admin";
import DesechoForm from "@/components/DesechoForm";

export default async function NuevoDesechoPage() {
  if (!(await tienePermiso("inventario.ajustar"))) redirect("/inventario/desechos");
  const centros = await listarCentrosFinales();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href="/inventario/desechos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Desechos
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nuevo desecho de PT</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Registrá el pan dañado o vencido con su costo estimado (del costeador). Reclasifica el costo
        a desecho por negocio, sin doblarlo.
      </p>
      <DesechoForm centros={centros} hoy={hoy} />
    </div>
  );
}
