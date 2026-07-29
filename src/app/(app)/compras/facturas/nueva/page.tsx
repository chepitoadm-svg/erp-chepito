import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import {
  listarArticulosParaSelector,
  listarBodegas,
  listarTarifasIva,
} from "@/lib/data/inventario";
import FacturaForm from "@/components/FacturaForm";

export default async function NuevaFacturaPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras/facturas");

  const [proveedores, bodegas, articulos, tarifas] = await Promise.all([
    listarProveedoresActivos(),
    listarBodegas(),
    listarArticulosParaSelector(),
    listarTarifasIva(),
  ]);

  if (proveedores.length === 0 || articulos.length === 0) {
    return (
      <div>
        <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Facturas
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Para registrar una factura necesitás al menos un proveedor y un artículo.
          {proveedores.length === 0 && (
            <>
              {" "}
              <Link href="/compras/proveedores" className="underline">
                Crear proveedor
              </Link>
              .
            </>
          )}
          {articulos.length === 0 && (
            <>
              {" "}
              <Link href="/inventario/articulos" className="underline">
                Crear artículo
              </Link>
              .
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Facturas
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Nueva factura de compra</h1>
      <FacturaForm
        proveedores={proveedores}
        bodegas={bodegas}
        articulos={articulos}
        tarifas={tarifas}
      />
    </div>
  );
}
