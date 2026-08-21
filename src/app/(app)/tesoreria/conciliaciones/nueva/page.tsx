import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCuentasBanco } from "@/lib/data/conciliaciones";
import ImportarEstadoCuentaForm from "@/components/ImportarEstadoCuentaForm";

export default async function NuevaConciliacionPage() {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/tesoreria/conciliaciones");
  const cuentas = await listarCuentasBanco();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href="/tesoreria/conciliaciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Conciliaciones
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Nueva conciliación</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Elegí la cuenta y la fecha de corte, y subí el estado de cuenta del banco. El sistema importa
        los movimientos y empareja automáticamente los que ya estén en libros.
      </p>
      <ImportarEstadoCuentaForm cuentas={cuentas} hoy={hoy} />
    </div>
  );
}
