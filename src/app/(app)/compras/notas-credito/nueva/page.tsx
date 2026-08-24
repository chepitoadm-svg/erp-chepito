import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import { listarCuentasPosteables, listarCentrosCosto } from "@/lib/data/asientos";

import NotaCreditoForm from "@/components/NotaCreditoForm";
import { crearNotaCredito } from "@/app/(app)/compras/actions";

export default async function NuevaNotaCreditoPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const [proveedores, cuentas, centros] = await Promise.all([
    listarProveedoresActivos(),
    listarCuentasPosteables(),
    listarCentrosCosto(),
  ]);
  const cuentaDefault = cuentas.find((c: { codigo: string }) => c.codigo === "51-20-01-00-00")?.id;

  return (
    <div>
      <Link href="/compras/cxp" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Cuentas por pagar
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nueva nota de crédito</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Registrá una nota de crédito del proveedor (una factura en negativo). Queda como crédito a favor y se aplica al
        pagar sus facturas.
      </p>
      <NotaCreditoForm
        action={crearNotaCredito}
        proveedores={proveedores.map((p: { id: string; nombre: string }) => ({ value: p.id, label: p.nombre }))}
        cuentas={cuentas.map((c: { id: string; codigo: string; nombre: string }) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
        centros={centros}
        cuentaDefault={cuentaDefault}
      />
    </div>
  );
}
