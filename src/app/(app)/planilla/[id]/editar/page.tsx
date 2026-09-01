import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerPlanilla } from "@/lib/data/planilla";
import PlanillaImportar, { type EdicionPlanilla } from "@/components/PlanillaImportar";

export default async function EditarPlanillaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const { id } = await params;
  const p = await obtenerPlanilla(id);
  if (!p) notFound();
  if (p.estado !== "borrador") redirect(`/planilla/${id}`);

  const edicion: EdicionPlanilla = {
    id: p.id,
    titulo: p.titulo ?? "",
    fecha: p.fecha,
    quincena: p.quincena,
    reparto_ch1: p.reparto_ch1,
    lineas: p.lineas.map((l) => ({
      clave: l.clave ?? "",
      cedula: l.cedula,
      nombre: l.nombre ?? "",
      puesto: l.puesto ?? "",
      tiene_ccss: l.tiene_ccss,
      destino: l.destino,
      salario_base: l.salario_base,
      ccss_obrero: l.ccss_obrero,
      cargas_patronal: l.cargas_patronal,
      pago_adicional: l.pago_adicional,
      adelanto: l.adelanto,
      rebajos: l.rebajos,
      embargo: l.embargo,
    })),
  };

  return (
    <div>
      <Link href={`/planilla/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Planilla
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Editar planilla</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Ajustá el destino de cada colaborador, la fecha, la quincena o el reparto. Los montos vienen del CSV; si están
        mal, eliminá esta planilla y volvé a importar el archivo corregido.
      </p>
      <PlanillaImportar edicion={edicion} />
    </div>
  );
}
