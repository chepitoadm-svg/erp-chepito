import Link from "next/link";
import { listarUsuarios } from "@/lib/data/usuarios";
import { tienePermiso } from "@/lib/auth/permisos";
import { alternarEstado } from "./actions";

export default async function UsuariosPage() {
  const puedeVer = await tienePermiso("usuarios.ver");
  if (!puedeVer) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No tenés permiso para ver usuarios.
      </div>
    );
  }

  const [usuarios, puedeCrear, puedeEditar, puedeAnular] = await Promise.all([
    listarUsuarios(),
    tienePermiso("usuarios.crear"),
    tienePermiso("usuarios.editar"),
    tienePermiso("usuarios.anular"),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Usuarios</h1>
          <p className="text-sm text-neutral-500">
            Gestión de usuarios, roles y sucursales.
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/usuarios/nuevo"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nuevo usuario
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Sucursales</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No hay usuarios visibles.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {u.nombre_completo || "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {u.rol_nombre ?? "Sin rol"}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {u.sucursales.length > 0
                    ? u.sucursales.map((s) => s.codigo).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.estado === "activo"
                        ? "inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                        : "inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500"
                    }
                  >
                    {u.estado === "activo" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {puedeEditar && (
                      <Link
                        href={`/usuarios/${u.id}`}
                        className="text-neutral-700 hover:text-neutral-900"
                      >
                        Editar
                      </Link>
                    )}
                    {puedeAnular && (
                      <form action={alternarEstado}>
                        <input type="hidden" name="id" value={u.id} />
                        <input
                          type="hidden"
                          name="estado_actual"
                          value={u.estado}
                        />
                        <button
                          type="submit"
                          className="text-neutral-500 hover:text-neutral-900"
                        >
                          {u.estado === "activo" ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
