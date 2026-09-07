import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import { listarRetiros, cxpPendientes, planillasPendientes } from "@/lib/data/cierre";
import { listarCuentasDeGastos } from "@/lib/data/gastos";
import RetirosCajaPanel from "@/components/RetirosCajaPanel";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function RetirosPage({
  params,
}: {
  params: Promise<{ anio: string; mes: string; centro: string }>;
}) {
  if (!(await tienePermiso("cierre.gestionar"))) redirect("/");
  const { anio: anioStr, mes: mesStr, centro: centroCod } = await params;
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound();

  const supabase = await createClient();
  const { data: centro } = await supabase
    .from("centros_costo")
    .select("id, codigo, nombre")
    .eq("codigo", centroCod.toUpperCase())
    .single();
  if (!centro) notFound();

  const [retiros, cuentasGasto, cxp, planillas, cajasRes, centrosRes, ingresoRes] = await Promise.all([
    listarRetiros(centro.id, anio, mes),
    listarCuentasDeGastos(),
    cxpPendientes(),
    planillasPendientes(),
    supabase
      .from("cuentas")
      .select("id, codigo, nombre")
      .like("codigo", "11-10-10-%")
      .eq("acepta_movimiento", true)
      .eq("estado", "activo")
      .order("codigo"),
    supabase.from("centros_costo").select("id, codigo, nombre").eq("activo", true).order("codigo"),
    supabase
      .from("cuentas")
      .select("id, codigo, nombre")
      .eq("tipo", "ingreso")
      .eq("acepta_movimiento", true)
      .eq("estado", "activo")
      .order("codigo"),
  ]);
  const cuentasCaja = (cajasRes.data ?? []) as { id: string; codigo: string; nombre: string }[];
  const centros = (centrosRes.data ?? []) as { id: string; codigo: string; nombre: string }[];
  const cuentasIngreso = (ingresoRes.data ?? []) as { id: string; codigo: string; nombre: string }[];

  return (
    <div>
      <div className="mb-4">
        <Link href={`/cierre/${anio}/${mes}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Cierre de {MESES[mes]} {anio}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">
          Retiros de caja · {centro.codigo} — {centro.nombre}
        </h1>
        <p className="text-sm text-neutral-500">
          Importá el Excel de retiros de QuPOS y marcá cuáles ya están ingresados como gasto en el
          sistema. El sistema sugiere el gasto que calza por fecha y monto.
        </p>
      </div>

      <RetirosCajaPanel
        retiros={retiros}
        centroId={centro.id}
        centroCodigo={centro.codigo}
        anio={anio}
        mes={mes}
        cuentasGasto={cuentasGasto}
        cuentasCaja={cuentasCaja}
        cxp={cxp}
        centros={centros}
        cuentasIngreso={cuentasIngreso}
        planillas={planillas}
      />
    </div>
  );
}
