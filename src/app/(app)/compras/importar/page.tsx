import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import ImportarComprasExcel from "@/components/ImportarComprasExcel";

export default async function ImportarComprasPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Importar compras (Excel)</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Subí el Excel de compras (resumen de facturas). Cada factura se importa por su bodega, que
        mapea a un centro de costo (Bodega Taller → Taller, Chepito 1 → CH1, Bodega Sucursal 2 → CH2),
        y postea la compra periódica por centro contra la cuenta por pagar del proveedor.
      </p>
      <ImportarComprasExcel />
    </div>
  );
}
