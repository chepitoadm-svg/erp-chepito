import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFacturasConfirmadas, obtenerFactura } from "@/lib/data/compras";
import { numeroFactura } from "@/lib/compras/numeroFactura";
import { listarBodegas } from "@/lib/data/inventario";
import DevolucionForm from "@/components/DevolucionForm";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function NuevaDevolucionPage({
  searchParams,
}: {
  searchParams: Promise<{ factura?: string }>;
}) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras/devoluciones");
  const { factura } = await searchParams;

  // Paso 1: elegir la factura de la cual devolver.
  if (!factura) {
    const facturas = await listarFacturasConfirmadas();
    return (
      <div>
        <Link href="/compras/devoluciones" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Devoluciones
        </Link>
        <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nueva devolución</h1>
        <p className="mb-4 text-sm text-neutral-500">Elegí la factura de la cual vas a devolver.</p>
        {facturas.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No hay facturas confirmadas para devolver.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Clave</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {facturas.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3 text-neutral-600">{f.fecha_emision}</td>
                    <td className="px-4 py-3 text-neutral-900">{f.proveedor_nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{numeroFactura(f.clave) ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {fmt(f.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/compras/devoluciones/nueva?factura=${f.id}`}
                        className="text-neutral-900 underline hover:no-underline"
                      >
                        Devolver de esta
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

  // Paso 2: la factura elegida → formulario con sus líneas.
  const [f, bodegas] = await Promise.all([obtenerFactura(factura), listarBodegas()]);
  if (!f || f.estado !== "confirmada") {
    return (
      <div>
        <Link href="/compras/devoluciones/nueva" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Elegir factura
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esa factura no existe o no está confirmada.
        </div>
      </div>
    );
  }

  const lineas = f.lineas.map((l) => ({
    articulo_id: l.articulo_id,
    articulo_codigo: l.articulo_codigo,
    articulo_nombre: l.articulo_nombre,
    cantidad_facturada: l.cantidad,
    costo_unitario: l.costo_unitario,
    iva_rate: l.base_imponible > 0 ? l.iva_monto / l.base_imponible : 0,
  }));

  return (
    <div>
      <Link href="/compras/devoluciones/nueva" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Elegir otra factura
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">
        Devolución — {f.proveedor_nombre}
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Factura {numeroFactura(f.clave) ?? "(sin número)"} · {f.fecha_emision}
      </p>
      <DevolucionForm
        facturaId={f.id}
        bodegas={bodegas}
        bodegaDefault={f.bodega_id ?? ""}
        lineas={lineas}
      />
    </div>
  );
}
