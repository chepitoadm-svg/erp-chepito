import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarArticulos,
  listarUnidades,
  listarTarifasIva,
  listarCuentasInventario,
} from "@/lib/data/inventario";
import ArticuloForm from "@/components/ArticuloForm";
import { crearArticulo, alternarArticuloEstado } from "../actions";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPO_ETIQUETA: Record<string, string> = {
  materia_prima: "Materia prima",
  producto_terminado: "Producto term.",
  suministro: "Suministro",
};

export default async function ArticulosPage() {
  if (!(await tienePermiso("articulos.gestionar"))) redirect("/inventario");

  const [articulos, unidades, tarifas, cuentas] = await Promise.all([
    listarArticulos(),
    listarUnidades(),
    listarTarifasIva(),
    listarCuentasInventario(),
  ]);

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Artículos</h1>
      <p className="mb-4 text-sm text-neutral-500">
        El catálogo. Las existencias y el costo promedio los mueve solo el kardex.
      </p>

      <details className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800">
          + Nuevo artículo
        </summary>
        <div className="mt-4">
          <ArticuloForm
            modo="crear"
            action={crearArticulo}
            unidades={unidades}
            tarifas={tarifas}
            cuentas={cuentas}
          />
        </div>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Unidad</th>
              <th className="px-4 py-3 font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Existencia</th>
              <th className="px-4 py-3 text-right font-medium">Costo prom.</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {articulos.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay artículos. Creá el primero arriba.
                </td>
              </tr>
            )}
            {articulos.map((a) => (
              <tr key={a.id} className={a.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-700">{a.codigo}</td>
                <td className="px-4 py-3 text-neutral-900">
                  {a.nombre}
                  {!a.inventariable && (
                    <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                      no inventariable
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">{TIPO_ETIQUETA[a.tipo] ?? a.tipo}</td>
                <td className="px-4 py-3 text-neutral-600">{a.unidad_codigo}</td>
                <td className="px-4 py-3 text-neutral-600">{a.iva_porcentaje}%</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(a.existencia_total)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(a.costo_promedio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(a.valor_total)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      a.estado === "activo"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {a.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/inventario/articulos/${a.id}`}
                      className="text-neutral-600 hover:text-neutral-900"
                    >
                      Editar
                    </Link>
                    <form action={alternarArticuloEstado}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="estado" value={a.estado} />
                      <button
                        type="submit"
                        className="text-neutral-500 hover:text-neutral-900"
                      >
                        {a.estado === "activo" ? "Inactivar" : "Activar"}
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
