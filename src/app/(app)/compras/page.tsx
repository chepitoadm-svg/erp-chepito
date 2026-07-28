import Link from "next/link";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function ComprasPage() {
  const puedeProveedores = await tienePermiso("proveedores.gestionar");

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Compras</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Proveedores y, próximamente, recepciones, facturas y devoluciones.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {puedeProveedores && (
          <Link
            href="/compras/proveedores"
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">Proveedores</div>
            <div className="mt-1 text-sm text-neutral-500">
              Alta por cédula jurídica y mapeo de sus códigos comerciales.
            </div>
          </Link>
        )}
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-5 text-neutral-400">
          <div className="font-medium">Recepciones y facturas</div>
          <div className="mt-1 text-sm">Próxima rebanada de la Fase 3.</div>
        </div>
      </div>
    </div>
  );
}
