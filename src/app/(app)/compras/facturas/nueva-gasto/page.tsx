import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedoresActivos, listarCuentasGasto } from "@/lib/data/compras";
import { listarCentrosCosto } from "@/lib/data/asientos";
import FacturaGastoForm from "@/components/FacturaGastoForm";

export default async function NuevaFacturaGastoPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras/facturas");

  const [proveedores, cuentas, centros] = await Promise.all([
    listarProveedoresActivos(),
    listarCuentasGasto(),
    listarCentrosCosto(),
  ]);

  if (proveedores.length === 0) {
    return (
      <div>
        <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Facturas
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Para registrar un gasto necesitás al menos un proveedor.{" "}
          <Link href="/compras/proveedores" className="underline">
            Crear proveedor
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Facturas
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Nueva factura de gasto</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Para compras que NO son inventario (servicios, limpieza, reparaciones, empaque…). Va directo
        al gasto del negocio y exige centro de costo.
      </p>
      <FacturaGastoForm proveedores={proveedores} cuentas={cuentas} centros={centros} />
    </div>
  );
}
