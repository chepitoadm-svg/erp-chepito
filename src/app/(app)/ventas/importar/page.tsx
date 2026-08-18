import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosFinales } from "@/lib/data/admin";
import ImportarVentasQupos from "@/components/ImportarVentasQupos";

export default async function ImportarVentasPage() {
  if (!(await tienePermiso("ventas.registrar"))) redirect("/ventas");
  const centros = await listarCentrosFinales();

  return (
    <div>
      <Link href="/ventas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ventas
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Importar ventas de QuPOS</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Subí el Excel de ventas que exporta QuPOS y elegí el negocio. El sistema suma las líneas por
        día (gravado, exento e IVA) y te deja registrar la venta de cada día. La fecha sale del
        propio archivo.
      </p>
      <ImportarVentasQupos centros={centros} />
    </div>
  );
}
