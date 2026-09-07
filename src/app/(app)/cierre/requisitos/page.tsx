import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import { listarRequisitos } from "@/lib/data/cierre";
import RequisitosEditor from "@/components/RequisitosEditor";

export default async function RequisitosPage() {
  if (!(await tienePermiso("cierre.gestionar"))) redirect("/");

  const supabase = await createClient();
  const [requisitos, centrosRes] = await Promise.all([
    listarRequisitos(),
    supabase.from("centros_costo").select("codigo, nombre").eq("activo", true).order("codigo"),
  ]);
  const centros = (centrosRes.data ?? []) as { codigo: string; nombre: string }[];

  return (
    <div>
      <div className="mb-4">
        <Link href="/cierre" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Cierre mensual
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Editar checklist de cierre</h1>
        <p className="text-sm text-neutral-500">
          Agregá, quitá o cambiá los requisitos que aparecen cada mes.
        </p>
      </div>

      <RequisitosEditor requisitos={requisitos} centros={centros} />
    </div>
  );
}
