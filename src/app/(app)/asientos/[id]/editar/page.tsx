import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  obtenerAsiento,
  listarCuentasPosteables,
  listarCentrosCosto,
} from "@/lib/data/asientos";
import AsientoForm from "@/components/AsientoForm";
import { editarAsiento } from "../../actions";

export default async function EditarAsientoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("asientos.crear"))) redirect("/asientos");

  const { id } = await params;
  const [asiento, cuentas, centros] = await Promise.all([
    obtenerAsiento(id),
    listarCuentasPosteables(),
    listarCentrosCosto(),
  ]);

  if (!asiento) notFound();
  // Solo se editan borradores; los demás son inmutables.
  if (asiento.estado !== "borrador") redirect(`/asientos/${id}`);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Editar asiento (borrador)</h1>
      <AsientoForm
        modo="editar"
        action={editarAsiento}
        cuentas={cuentas}
        centros={centros}
        inicial={{
          id: asiento.id,
          tipo: asiento.tipo,
          fecha: asiento.fecha,
          glosa: asiento.glosa,
          lineas: asiento.lineas.map((l) => ({
            cuenta_id: l.cuenta_id,
            centro_costo_id: l.centro_costo_id ?? "",
            debito: Number(l.debito) > 0 ? String(l.debito) : "",
            credito: Number(l.credito) > 0 ? String(l.credito) : "",
            detalle: l.detalle ?? "",
          })),
        }}
      />
    </div>
  );
}
