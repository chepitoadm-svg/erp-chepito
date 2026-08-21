import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosCosto } from "@/lib/data/asientos";
import { listarCuentasSoloGasto, listarCuentasPagoGasto, obtenerGastoEditable } from "@/lib/data/gastos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import { editarGasto } from "../../actions";
import GastoForm from "@/components/GastoForm";

export default async function EditarGastoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/gastos");
  const { id } = await params;
  const g = await obtenerGastoEditable(id);
  if (!g) notFound();
  if (g.estado === "anulado") redirect(`/gastos/${id}`);

  const [centros, cuentasGasto, cuentasPago, proveedores] = await Promise.all([
    listarCentrosCosto(),
    listarCuentasSoloGasto(),
    listarCuentasPagoGasto(),
    listarProveedoresActivos(),
  ]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href={`/gastos/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Gasto
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Editar gasto</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {g.estado === "confirmado"
          ? "Este gasto está confirmado: al guardar, el sistema anula el asiento viejo (y su cuenta por pagar) y crea el corregido automáticamente."
          : "Cambiá lo que necesités y guardá."}
      </p>
      <GastoForm
        centros={centros}
        cuentasGasto={cuentasGasto}
        cuentasPago={cuentasPago}
        proveedores={proveedores}
        hoy={hoy}
        accion={editarGasto}
        initial={g}
      />
    </div>
  );
}
