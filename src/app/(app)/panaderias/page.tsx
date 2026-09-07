import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosCosto } from "@/lib/data/asientos";
import { listarPanaderiaDatos } from "@/lib/data/panaderias";
import PanaderiaDatos from "@/components/PanaderiaDatos";

export default async function PanaderiasPage() {
  const [centrosRaw, datos, puedeEditar] = await Promise.all([
    listarCentrosCosto(),
    listarPanaderiaDatos(),
    tienePermiso("gastos.registrar"),
  ]);
  const centros = (centrosRaw as { id: string; codigo: string; nombre: string }[]).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
  }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-neutral-900">Panaderías</h1>
        <p className="text-sm text-neutral-500">
          Datos y servicios de cada centro: NIS del agua y de la luz, medidores, contratos, teléfonos… Poné la etiqueta
          que quieras y su valor.
        </p>
      </div>
      {!puedeEditar && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Solo lectura: no tenés permiso para editar estos datos.
        </p>
      )}
      <PanaderiaDatos centros={centros} datos={datos} puedeEditar={puedeEditar} />
    </div>
  );
}
