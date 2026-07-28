import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedores, listarCuentasCxp } from "@/lib/data/compras";
import ProveedorForm from "@/components/ProveedorForm";
import { crearProveedor, alternarProveedorEstado } from "../actions";

const COND: Record<string, string> = { "01": "Contado", "02": "Crédito" };

export default async function ProveedoresPage() {
  if (!(await tienePermiso("proveedores.gestionar"))) redirect("/compras");

  const [proveedores, cuentasCxp] = await Promise.all([
    listarProveedores(),
    listarCuentasCxp(),
  ]);

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Proveedores</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Se identifican por cédula jurídica (así se matchea el emisor del XML).
      </p>

      <details className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800">
          + Nuevo proveedor
        </summary>
        <div className="mt-4">
          <ProveedorForm modo="crear" action={crearProveedor} cuentasCxp={cuentasCxp} />
        </div>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cédula</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Condición</th>
              <th className="px-4 py-3 font-medium">CxP</th>
              <th className="px-4 py-3 text-right font-medium">Mapeos</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay proveedores. Creá el primero arriba.
                </td>
              </tr>
            )}
            {proveedores.map((p) => (
              <tr key={p.id} className={p.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">{p.cedula_juridica}</td>
                <td className="px-4 py-3 text-neutral-900">{p.nombre}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {p.condicion_venta_default ? COND[p.condicion_venta_default] : "—"}
                  {p.plazo_credito_default ? ` (${p.plazo_credito_default} d)` : ""}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {p.cuenta_cxp_codigo ?? "por defecto"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{p.n_mapeos}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      p.estado === "activo"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/compras/proveedores/${p.id}`}
                      className="text-neutral-600 hover:text-neutral-900"
                    >
                      Editar
                    </Link>
                    <form action={alternarProveedorEstado}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="estado" value={p.estado} />
                      <button type="submit" className="text-neutral-500 hover:text-neutral-900">
                        {p.estado === "activo" ? "Inactivar" : "Activar"}
                      </button>
                    </form>
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
