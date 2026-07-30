import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarProveedoresConCxP,
  listarCxPPendientes,
  listarCuentasPago,
  obtenerProveedor,
} from "@/lib/data/compras";
import PagoForm from "@/components/PagoForm";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string }>;
}) {
  if (!(await tienePermiso("compras.pagar"))) redirect("/compras/pagos");
  const { proveedor } = await searchParams;

  // Paso 1: elegir el proveedor al cual pagar.
  if (!proveedor) {
    const provs = await listarProveedoresConCxP();
    return (
      <div>
        <Link href="/compras/pagos" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Pagos
        </Link>
        <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nuevo pago</h1>
        <p className="mb-4 text-sm text-neutral-500">Elegí el proveedor a quien vas a pagar.</p>
        {provs.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            No hay facturas pendientes de pago. Todo al día.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium">Facturas</th>
                  <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {provs.map((p) => (
                  <tr key={p.proveedor_id}>
                    <td className="px-4 py-3 text-neutral-900">{p.proveedor_nombre}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                      {p.n_facturas}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                      {fmt(p.total_pendiente)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/compras/pagos/nuevo?proveedor=${p.proveedor_id}`}
                        className="text-neutral-900 underline hover:no-underline"
                      >
                        Pagar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Paso 2: el proveedor elegido → formulario con sus facturas pendientes.
  const [prov, cxp, cuentas] = await Promise.all([
    obtenerProveedor(proveedor),
    listarCxPPendientes(proveedor),
    listarCuentasPago(),
  ]);
  if (!prov) {
    return (
      <div>
        <Link href="/compras/pagos/nuevo" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Elegir proveedor
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Ese proveedor no existe.
        </div>
      </div>
    );
  }
  if (cxp.length === 0) {
    return (
      <div>
        <Link href="/compras/pagos/nuevo" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Elegir proveedor
        </Link>
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {prov.nombre} no tiene facturas pendientes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/compras/pagos/nuevo" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Elegir otro proveedor
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Pago a {prov.nombre}</h1>
      <PagoForm
        proveedorId={prov.id}
        proveedorNombre={prov.nombre}
        cxp={cxp}
        cuentas={cuentas}
      />
    </div>
  );
}
