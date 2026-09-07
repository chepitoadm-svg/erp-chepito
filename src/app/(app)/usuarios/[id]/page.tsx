import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarRoles,
  listarRolesDetalle,
  listarPermisos,
  listarSucursales,
  obtenerUsuario,
  permisosDeRol,
  permisosDeUsuario,
} from "@/lib/data/usuarios";
import UsuarioForm from "@/components/UsuarioForm";
import RestablecerPasswordBtn from "@/components/RestablecerPasswordBtn";
import PermisosUsuario from "@/components/PermisosUsuario";
import { editarUsuario } from "../actions";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("usuarios.editar"))) redirect("/usuarios");

  const { id } = await params;
  const [usuario, roles, rolesDetalle, sucursales, permisos] = await Promise.all([
    obtenerUsuario(id),
    listarRoles(),
    listarRolesDetalle(),
    listarSucursales(),
    listarPermisos(),
  ]);

  if (!usuario) notFound();

  const rolActual = rolesDetalle.find((r) => r.id === usuario.rol_id);
  const esAdmin = rolActual?.codigo === "administrador";
  const [basePerfil, overrides] = await Promise.all([
    usuario.rol_id ? permisosDeRol(usuario.rol_id) : Promise.resolve([]),
    permisosDeUsuario(id),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="mb-6 text-lg font-semibold text-neutral-900">Editar usuario</h1>
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

      <RestablecerPasswordBtn usuarioId={usuario.id} />

      <PermisosUsuario
        usuarioId={usuario.id}
        permisos={permisos}
        basePerfil={basePerfil}
        conceder={overrides.conceder}
        revocar={overrides.revocar}
        esAdmin={esAdmin}
      />
    </div>
  );
}
