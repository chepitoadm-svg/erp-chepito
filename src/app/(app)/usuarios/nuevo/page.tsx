import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarRoles, listarSucursales } from "@/lib/data/usuarios";
import UsuarioForm from "@/components/UsuarioForm";
import { crearUsuario } from "../actions";

export default async function NuevoUsuarioPage() {
  if (!(await tienePermiso("usuarios.crear"))) redirect("/usuarios");

  const [roles, sucursales] = await Promise.all([
    listarRoles(),
    listarSucursales(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">
        Nuevo usuario
      </h1>
      <UsuarioForm
        modo="crear"
        action={crearUsuario}
        roles={roles}
        sucursales={sucursales}
      />
    </div>
  );
}
