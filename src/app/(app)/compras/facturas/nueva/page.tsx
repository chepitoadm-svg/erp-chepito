import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarProveedoresActivos, obtenerRecepcion } from "@/lib/data/compras";
import {
  listarArticulosParaSelector,
  listarBodegas,
  listarTarifasIva,
} from "@/lib/data/inventario";
import { listarCentrosCosto } from "@/lib/data/asientos";
import FacturaForm from "@/components/FacturaForm";

export default async function NuevaFacturaPage({
  searchParams,
}: {
  searchParams: Promise<{ recepcion?: string }>;
}) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras/facturas");
  const { recepcion } = await searchParams;

  const [proveedores, bodegas, articulos, tarifas, centros] = await Promise.all([
    listarProveedoresActivos(),
    listarBodegas(),
    listarArticulosParaSelector(),
    listarTarifasIva(),
    listarCentrosCosto(),
  ]);

  // Modo caso B: la factura salda una recepción confirmada.
  if (recepcion) {
    const r = await obtenerRecepcion(recepcion);
    if (!r || r.estado !== "confirmada" || r.facturada) {
      return (
        <div>
          <Link href="/compras/recepciones" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Recepciones
          </Link>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Esa recepción no existe, no está confirmada, o ya fue facturada.
          </div>
        </div>
      );
    }
    return (
      <div>
        <Link
          href={`/compras/recepciones/${r.id}`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Recepción
        </Link>
        <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">
          Facturar recepción — {r.proveedor_nombre}
        </h1>
        <FacturaForm
          proveedores={proveedores}
          bodegas={bodegas}
          articulos={articulos}
          tarifas={tarifas}
          recepcion={{
            id: r.id,
            proveedor_nombre: r.proveedor_nombre,
            bodega_codigo: r.bodega_codigo,
          }}
          lineasIniciales={r.lineas.map((l) => ({
            articulo_id: l.articulo_id,
            cantidad: l.cantidad,
            costo_unitario: l.costo_unitario,
            iva_tarifa_id: l.iva_tarifa_id,
          }))}
        />
      </div>
    );
  }

  if (proveedores.length === 0 || articulos.length === 0) {
    return (
      <div>
        <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Facturas
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Para registrar una factura necesitás al menos un proveedor y un artículo.
          {proveedores.length === 0 && (
            <>
              {" "}
              <Link href="/compras/proveedores" className="underline">
                Crear proveedor
              </Link>
              .
            </>
          )}
          {articulos.length === 0 && (
            <>
              {" "}
              <Link href="/inventario/articulos" className="underline">
                Crear artículo
              </Link>
              .
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/compras/facturas" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Facturas
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">Nueva factura de compra</h1>
      <FacturaForm
        proveedores={proveedores}
        bodegas={bodegas}
        articulos={articulos}
        tarifas={tarifas}
        centros={centros}
      />
    </div>
  );
}
