import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosFinales } from "@/lib/data/admin";
import VentaDiaForm from "@/components/VentaDiaForm";

export default async function NuevaVentaPage() {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/ventas");
  const centros = await listarCentrosFinales();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href="/ventas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ventas
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nueva venta del día</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Registrá lo vendido en el negocio (gravado, exento e IVA). Al confirmar postea la venta al
        mayor por centro de costo.
      </p>
      <VentaDiaForm centros={centros} hoy={hoy} />
    </div>
  );
}
