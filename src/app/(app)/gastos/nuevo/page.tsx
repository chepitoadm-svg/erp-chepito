import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosCosto } from "@/lib/data/asientos";
import { listarCuentasSoloGasto, listarCuentasPagoGasto } from "@/lib/data/gastos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import GastoForm from "@/components/GastoForm";

export default async function NuevoGastoPage() {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/gastos");
  const [centros, cuentasGasto, cuentasPago, proveedores] = await Promise.all([
    listarCentrosCosto(),
    listarCuentasSoloGasto(),
    listarCuentasPagoGasto(),
    listarProveedoresActivos(),
  ]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href="/gastos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Gastos
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nuevo gasto</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Registrá un gasto con su centro de costo. Al confirmar postea el asiento (Debe la cuenta de
        gasto por centro, Haber la caja/banco o la cuenta por pagar).
      </p>
      <GastoForm
        centros={centros}
        cuentasGasto={cuentasGasto}
        cuentasPago={cuentasPago}
        proveedores={proveedores}
        hoy={hoy}
      />
    </div>
  );
}
