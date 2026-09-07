import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPermisos } from "@/lib/data/usuarios";
import RolForm from "@/components/RolForm";
import { crearRol } from "../actions";

export default async function NuevoRolPage() {
  if (!(await tienePermiso("roles.gestionar"))) redirect("/");
  const permisos = await listarPermisos();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Nuevo perfil de acceso</h1>
      <RolForm modo="crear" action={crearRol} permisos={permisos} />
    </div>
  );
}
