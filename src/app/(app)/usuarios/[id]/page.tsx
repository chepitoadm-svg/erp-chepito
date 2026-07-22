import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarRoles,
  listarSucursales,
  obtenerUsuario,
} from "@/lib/data/usuarios";
import UsuarioForm from "@/components/UsuarioForm";
import { editarUsuario } from "../actions";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("usuarios.editar"))) redirect("/usuarios");

  const { id } = await params;
  const [usuario, roles, sucursales] = await Promise.all([
    obtenerUsuario(id),
    listarRoles(),
    listarSucursales(),
  ]);

  if (!usuario) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">
        Editar usuario
      </h1>
      <UsuarioForm
        modo="editar"
        action={editarUsuario}
        roles={roles}
        sucursales={sucursales}
        inicial={{
          id: usuario.id,
          nombre_completo: usuario.nombre_completo,
          email: usuario.email,
          rol_id: usuario.rol_id,
          sucursales: usuario.sucursales,
        }}
      />
    </div>
  );
}
