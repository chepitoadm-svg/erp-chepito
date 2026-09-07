import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarRolesDetalle } from "@/lib/data/usuarios";
import { alternarEstadoRol } from "./actions";

export default async function RolesPage() {
  if (!(await tienePermiso("roles.gestionar"))) redirect("/");
  const roles = await listarRolesDetalle();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Perfiles de acceso</h1>
          <p className="text-sm text-neutral-500">
            Cada perfil define qué puede hacer un grupo de usuarios. Asigná el perfil a cada usuario
            desde <Link href="/usuarios" className="underline">Usuarios</Link>.
          </p>
        </div>
        <Link
          href="/roles/nuevo"
          className="whitespace-nowrap rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo perfil
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 text-right font-medium">Permisos</th>
              <th className="px-4 py-3 text-right font-medium">Usuarios</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {roles.map((r) => (
              <tr key={r.id} className={r.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">
                    {r.nombre}
                    {r.es_sistema && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-500">
                        sistema
                      </span>
                    )}
                  </div>
                  {r.descripcion && <div className="text-xs text-neutral-500">{r.descripcion}</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {r.codigo === "administrador" ? "todos" : r.n_permisos}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{r.n_usuarios}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      r.estado === "activo" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {r.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/roles/${r.id}`} className="text-neutral-600 hover:text-neutral-900">
                      {r.es_sistema ? "Ver / ajustar" : "Editar"}
                    </Link>
                    {!r.es_sistema && (
                      <form action={alternarEstadoRol}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="estado_actual" value={r.estado} />
                        <button
                          type="submit"
                          className="text-neutral-500 hover:text-neutral-900"
                          title={r.estado === "activo" ? "Desactivar perfil" : "Activar perfil"}
                        >
                          {r.estado === "activo" ? "Desactivar" : "Activar"}
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
