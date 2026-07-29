import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import { listarArticulosParaSelector, listarBodegas } from "@/lib/data/inventario";
import RecepcionForm from "@/components/RecepcionForm";

export default async function NuevaRecepcionPage() {
  if (!(await tienePermiso("compras.recibir"))) redirect("/compras/recepciones");

  const [proveedores, bodegas, articulos] = await Promise.all([
    listarProveedoresActivos(),
    listarBodegas(),
    listarArticulosParaSelector(),
  ]);

  if (proveedores.length === 0 || articulos.length === 0) {
    return (
      <div>
        <Link href="/compras/recepciones" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Recepciones
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Necesitás al menos un proveedor y un artículo para recibir mercadería.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/compras/recepciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Recepciones
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Nueva recepción</h1>
      <RecepcionForm proveedores={proveedores} bodegas={bodegas} articulos={articulos} />
    </div>
  );
}
