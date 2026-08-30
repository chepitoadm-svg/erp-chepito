import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCentrosFinales } from "@/lib/data/admin";
import ImportarDatafono from "@/components/ImportarDatafono";

export default async function DatafonoPage() {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/tesoreria/conciliaciones");
  const centros = await listarCentrosFinales();

  return (
    <div>
      <Link href="/tesoreria/conciliaciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Conciliaciones
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Liquidación de datafono</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Subí el TXT de Credomatic del mes y elegí el negocio. El sistema lee la facturación, comisión, servicios y
        retenciones, y arma el asiento: descuenta todo eso, deposita el neto en el banco y <b>cierra el datafono</b>{" "}
        (las tarjetas del POS). La diferencia entre lo que facturó el procesador y lo que registró el POS va a
        &ldquo;Diferencias voucher&rdquo;.
      </p>
      <ImportarDatafono centros={centros} />
    </div>
  );
}
