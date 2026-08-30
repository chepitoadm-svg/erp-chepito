import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarAliasProveedor } from "@/lib/data/proveedorAlias";
import { listarProveedoresActivos } from "@/lib/data/compras";
import { asignarAliasProveedor, borrarAliasProveedor } from "../conciliaciones/actions";

export default async function ProveedoresBancoPage() {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/");
  const [alias, proveedoresRaw] = await Promise.all([listarAliasProveedor(), listarProveedoresActivos()]);
  const proveedores = (proveedoresRaw as { id: string; nombre: string }[]).map((p) => ({ id: p.id, nombre: p.nombre }));

  const inputCls =
    "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 outline-none focus:border-neutral-500";

  return (
    <div>
      <Link href="/tesoreria/conciliaciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Conciliaciones
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Proveedores por cuenta del banco</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Ligá el identificador que aparece en el estado de cuenta (la cuenta destino de un TEF, un número SINPE, o parte
        del nombre) con un proveedor. En la conciliación, cada línea te dirá de quién es. Un proveedor puede tener varios.
      </p>

      {/* Alta */}
      <form action={asignarAliasProveedor} className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Proveedor
          <select name="proveedor_id" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Elegí…
            </option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Identificador (como sale en el banco)
          <input name="alias" required placeholder="ej. 900973348" className={`${inputCls} w-56`} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Agregar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Identificador</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {alias.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay identificadores ligados. Agregá uno arriba, o asigná proveedores desde la conciliación.
                </td>
              </tr>
            )}
            {alias.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 font-mono text-neutral-700">{a.alias}</td>
                <td className="px-4 py-2 text-neutral-800">{a.proveedor_nombre}</td>
                <td className="px-4 py-2 text-right">
                  <form action={borrarAliasProveedor}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
                      borrar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
