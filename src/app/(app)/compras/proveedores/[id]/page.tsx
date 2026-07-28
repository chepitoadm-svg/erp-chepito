import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  obtenerProveedor,
  listarCuentasCxp,
  listarMapeoProveedor,
} from "@/lib/data/compras";
import { listarArticulosParaSelector, listarUnidades } from "@/lib/data/inventario";
import ProveedorForm from "@/components/ProveedorForm";
import MapeoForm from "@/components/MapeoForm";
import { editarProveedor, quitarMapeo } from "../../actions";

export default async function EditarProveedorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("proveedores.gestionar"))) redirect("/compras");
  const { id } = await params;

  const [proveedor, cuentasCxp, mapeos, articulos, unidades] = await Promise.all([
    obtenerProveedor(id),
    listarCuentasCxp(),
    listarMapeoProveedor(id),
    listarArticulosParaSelector(),
    listarUnidades(),
  ]);
  if (!proveedor) notFound();

  return (
    <div>
      <Link href="/compras/proveedores" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Proveedores
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">{proveedor.nombre}</h1>

      <ProveedorForm
        modo="editar"
        action={editarProveedor}
        cuentasCxp={cuentasCxp}
        inicial={{
          id: proveedor.id,
          cedula_juridica: proveedor.cedula_juridica,
          nombre: proveedor.nombre,
          condicion_venta_default: proveedor.condicion_venta_default,
          plazo_credito_default: proveedor.plazo_credito_default,
          cuenta_cxp_id: proveedor.cuenta_cxp_id,
        }}
      />

      <div className="mt-10 border-t border-neutral-200 pt-6">
        <h2 className="text-base font-semibold text-neutral-900">Mapeo de artículos</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Liga el código comercial que el proveedor pone en su factura a tu artículo,
          y la conversión de la unidad de compra a la de stock (ej. 1 CJ = 12 UN).
          El ingestor de XML lo irá alimentando solo.
        </p>

        <div className="mb-4">
          <MapeoForm proveedorId={proveedor.id} articulos={articulos} unidades={unidades} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código comercial</th>
                <th className="px-4 py-3 font-medium">Artículo</th>
                <th className="px-4 py-3 font-medium">Unidad compra</th>
                <th className="px-4 py-3 text-right font-medium">Factor a stock</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {mapeos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                    Sin mapeos todavía.
                  </td>
                </tr>
              )}
              {mapeos.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {m.codigo_comercial}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {m.articulo_codigo} — {m.articulo_nombre}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{m.unidad_compra_codigo}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {m.factor_a_stock}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={quitarMapeo}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="proveedor_id" value={proveedor.id} />
                      <button type="submit" className="text-red-600 hover:text-red-800">
                        Quitar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
