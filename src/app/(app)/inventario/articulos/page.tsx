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
import ArticulosTabla from "@/components/ArticulosTabla";
import { crearArticulo, alternarArticuloEstado, cargarKardexArticulo } from "../actions";

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

      <ArticulosTabla
        articulos={articulos}
        alternarEstado={alternarArticuloEstado}
        cargarKardex={cargarKardexArticulo}
      />
    </div>
  );
}
