import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarArticulosParaSelector, listarBodegas } from "@/lib/data/inventario";
import TransferenciaForm from "@/components/TransferenciaForm";

export default async function NuevaTransferenciaPage() {
  if (!(await tienePermiso("inventario.transferir"))) redirect("/inventario/transferencias");

  const [articulos, bodegas] = await Promise.all([
    listarArticulosParaSelector(),
    listarBodegas(),
  ]);

  return (
    <div>
      <Link
        href="/inventario/transferencias"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← Transferencias
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Nueva transferencia</h1>
      <TransferenciaForm articulos={articulos} bodegas={bodegas} />
    </div>
  );
}
