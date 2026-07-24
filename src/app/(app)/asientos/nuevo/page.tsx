import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCuentasPosteables, listarCentrosCosto } from "@/lib/data/asientos";
import AsientoForm from "@/components/AsientoForm";
import { crearAsiento } from "../actions";

export default async function NuevoAsientoPage() {
  if (!(await tienePermiso("asientos.crear"))) redirect("/asientos");

  const [cuentas, centros] = await Promise.all([
    listarCuentasPosteables(),
    listarCentrosCosto(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Nuevo asiento</h1>
      <AsientoForm modo="crear" action={crearAsiento} cuentas={cuentas} centros={centros} />
    </div>
  );
}
