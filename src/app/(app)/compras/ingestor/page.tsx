import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarIngesta } from "@/lib/data/compras";
import SubirComprobante from "@/components/SubirComprobante";
import IngestorBandejaTabla from "@/components/IngestorBandejaTabla";

export default async function IngestorPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const comprobantes = await listarIngesta();

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Ingestor de XML</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Subí el XML de la factura electrónica de Hacienda y su respuesta. El sistema lo lee,
        valida y prepara la factura de compra.
      </p>

      <div className="mb-6">
        <SubirComprobante />
      </div>

      <h2 className="mb-2 text-sm font-medium text-neutral-800">Bandeja</h2>
      <IngestorBandejaTabla comprobantes={comprobantes} />
    </div>
  );
}
