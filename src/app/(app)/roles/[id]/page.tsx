import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarPermisos, obtenerRol, permisosDeRol } from "@/lib/data/usuarios";
import RolForm from "@/components/RolForm";
import { editarRol } from "../actions";

export default async function EditarRolPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("roles.gestionar"))) redirect("/");
  const { id } = await params;
  const [rol, permisos, asignados] = await Promise.all([
    obtenerRol(id),
    listarPermisos(),
    permisosDeRol(id),
  ]);
  if (!rol) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Editar perfil</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {rol.n_usuarios} usuario(s) activo(s) con este perfil.
      </p>
      <RolForm
        modo="editar"
        action={editarRol}
        permisos={permisos}
        esAdmin={rol.codigo === "administrador"}
        inicial={{
          id: rol.id,
          nombre: rol.nombre,
          descripcion: rol.descripcion,
          permisos: asignados,
        }}
      />
    </div>
  );
}
