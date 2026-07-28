import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  obtenerArticulo,
  listarUnidades,
  listarTarifasIva,
  listarCuentasInventario,
} from "@/lib/data/inventario";
import ArticuloForm from "@/components/ArticuloForm";
import { editarArticulo } from "../../actions";

export default async function EditarArticuloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("articulos.gestionar"))) redirect("/inventario");
  const { id } = await params;

  const [articulo, unidades, tarifas, cuentas] = await Promise.all([
    obtenerArticulo(id),
    listarUnidades(),
    listarTarifasIva(),
    listarCuentasInventario(),
  ]);
  if (!articulo) notFound();

  return (
    <div>
      <Link
        href="/inventario/articulos"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← Artículos
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">
        Editar {articulo.codigo}
      </h1>
      <ArticuloForm
        modo="editar"
        action={editarArticulo}
        unidades={unidades}
        tarifas={tarifas}
        cuentas={cuentas}
        inicial={{
          id: articulo.id,
          codigo: articulo.codigo,
          nombre: articulo.nombre,
          tipo: articulo.tipo,
          unidad_stock_id: articulo.unidad_stock_id,
          iva_tarifa_id: articulo.iva_tarifa_id,
          cuenta_inventario_id: articulo.cuenta_inventario_id,
          cabys_codigo: articulo.cabys_codigo,
          inventariable: articulo.inventariable,
        }}
      />
    </div>
  );
}
