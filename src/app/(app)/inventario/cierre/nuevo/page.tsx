import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarBodegas, articulosParaCierre } from "@/lib/data/inventario";
import CierreForm from "@/components/CierreForm";

export default async function NuevoCierrePage({
  searchParams,
}: {
  searchParams: Promise<{ bodega?: string }>;
}) {
  if (!(await tienePermiso("inventario.ajustar"))) redirect("/inventario/cierre");
  const { bodega } = await searchParams;
  const bodegas = await listarBodegas();

  // Paso 1: elegir la bodega a cerrar.
  if (!bodega) {
    return (
      <div>
        <Link href="/inventario/cierre" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Cierres
        </Link>
        <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nuevo cierre</h1>
        <p className="mb-4 text-sm text-neutral-500">Elegí la bodega que vas a cerrar.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bodegas.map((b) => (
            <Link
              key={b.id}
              href={`/inventario/cierre/nuevo?bodega=${b.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <div className="font-medium text-neutral-900">
                {b.codigo} — {b.nombre}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Paso 2: conteo físico de esa bodega.
  const b = bodegas.find((x) => x.id === bodega);
  if (!b) {
    return (
      <div>
        <Link href="/inventario/cierre/nuevo" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Elegir bodega
        </Link>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esa bodega no existe o no la podés ver.
        </div>
      </div>
    );
  }
  const articulos = await articulosParaCierre(bodega);

  return (
    <div>
      <Link href="/inventario/cierre/nuevo" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Elegir otra bodega
      </Link>
      <h1 className="mt-1 mb-4 text-lg font-semibold text-neutral-900">
        Cierre — {b.codigo} {b.nombre}
      </h1>
      {articulos.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
          Esa bodega no tiene existencias para contar.
        </div>
      ) : (
        <CierreForm bodegaId={b.id} bodegaLabel={`${b.codigo} ${b.nombre}`} articulos={articulos} />
      )}
    </div>
  );
}
