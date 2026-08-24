import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerNotaCredito, obtenerNotaCreditoEditable, listarProveedoresActivos } from "@/lib/data/compras";
import { listarCuentasPosteables, listarCentrosCosto } from "@/lib/data/asientos";
import NotaCreditoForm from "@/components/NotaCreditoForm";
import { editarNotaCredito } from "@/app/(app)/compras/actions";

export default async function EditarNotaCreditoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const { id } = await params;
  const [detalle, editable, proveedores, cuentas, centros] = await Promise.all([
    obtenerNotaCredito(id),
    obtenerNotaCreditoEditable(id),
    listarProveedoresActivos(),
    listarCuentasPosteables(),
    listarCentrosCosto(),
  ]);
  if (!detalle || !editable) notFound();
  if (detalle.estado !== "confirmada" || detalle.aplicada) redirect(`/compras/notas-credito/${id}`);

  return (
    <div>
      <Link href={`/compras/notas-credito/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Nota de crédito
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Editar nota de crédito</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Al guardar, se anula la nota actual y se crea una corregida (el documento confirmado es inmutable). El proveedor
        no cambia.
      </p>
      <NotaCreditoForm
        action={editarNotaCredito}
        notaCreditoId={id}
        proveedores={proveedores.map((p: { id: string; nombre: string }) => ({ value: p.id, label: p.nombre }))}
        cuentas={cuentas.map((c: { id: string; codigo: string; nombre: string }) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
        centros={centros}
        inicial={{
          proveedor_id: editable.proveedor_id,
          fecha: editable.fecha,
          cuenta_id: editable.cuenta_id,
          centro_costo_id: editable.centro_costo_id,
          subtotal: editable.subtotal,
          iva: editable.iva,
          referencia: editable.referencia,
          glosa: editable.glosa,
        }}
      />
    </div>
  );
}
