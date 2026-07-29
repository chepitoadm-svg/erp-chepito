import Link from "next/link";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function ComprasPage() {
  const [puedeProveedores, puedeFacturar] = await Promise.all([
    tienePermiso("proveedores.gestionar"),
    tienePermiso("compras.facturar"),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Compras</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Proveedores, facturas de compra y cuentas por pagar.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {puedeFacturar && (
          <Link
            href="/compras/facturas"
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">Facturas de compra</div>
            <div className="mt-1 text-sm text-neutral-500">
              Registrar la factura del proveedor: trae la mercadería y crea la CxP.
            </div>
          </Link>
        )}
        {puedeFacturar && (
          <Link
            href="/compras/cxp"
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">Cuentas por pagar</div>
            <div className="mt-1 text-sm text-neutral-500">
              Saldos con proveedores por vencimiento.
            </div>
          </Link>
        )}
        {puedeFacturar && (
          <Link
            href="/compras/devoluciones"
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">Devoluciones de compra</div>
            <div className="mt-1 text-sm text-neutral-500">
              Devolver mercadería al proveedor: baja inventario, IVA y CxP.
            </div>
          </Link>
        )}
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
          <div className="font-medium">Recepciones separadas</div>
          <div className="mt-1 text-sm">Próxima rebanada de la Fase 3 (D2).</div>
        </div>
      </div>
    </div>
  );
}
