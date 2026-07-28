import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarArticulosParaSelector, listarBodegas } from "@/lib/data/inventario";
import AjusteForm from "@/components/AjusteForm";

export default async function NuevoAjustePage() {
  if (!(await tienePermiso("inventario.ajustar"))) redirect("/inventario/ajustes");

  const [articulos, bodegas] = await Promise.all([
    listarArticulosParaSelector(),
    listarBodegas(),
  ]);

  return (
    <div>
      <Link href="/inventario/ajustes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ajustes
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Nuevo ajuste</h1>
      <AjusteForm articulos={articulos} bodegas={bodegas} />
    </div>
  );
}
