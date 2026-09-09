import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { detalleCierre, listarCierres, archivosDeItem, type ArchivoItem } from "@/lib/data/cierre";
import CierreItemRow from "@/components/CierreItemRow";
import CerrarMesBtn from "@/components/CerrarMesBtn";
import RegenerarMesBtn from "@/components/RegenerarMesBtn";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function CierreMesPage({
  params,
}: {
  params: Promise<{ anio: string; mes: string }>;
}) {
  if (!(await tienePermiso("cierre.gestionar"))) redirect("/");
  const { anio: anioStr, mes: mesStr } = await params;
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound();

  const [items, cierres] = await Promise.all([detalleCierre(anio, mes), listarCierres()]);
  const cierre = cierres.find((c) => c.anio === anio && c.mes === mes);
  if (!cierre) notFound();

  // Archivos de los items que tengan alguno (una sola pasada en paralelo).
  const conArchivos = items.filter((i) => i.n_archivos > 0);
  const listas = await Promise.all(conArchivos.map((i) => archivosDeItem(i.item_id)));
  const archivosMap = new Map<string, ArchivoItem[]>();
  conArchivos.forEach((i, idx) => archivosMap.set(i.item_id, listas[idx]));

  const bloqueado = cierre.estado === "cerrado";
  const pct = cierre.total > 0 ? Math.round((cierre.listos / cierre.total) * 100) : 0;

  // Agrupar por grupo, respetando el orden.
  const grupos: { grupo: string; items: typeof items }[] = [];
  for (const it of items) {
    let g = grupos.find((x) => x.grupo === it.grupo);
    if (!g) grupos.push((g = { grupo: it.grupo, items: [] }));
    g.items.push(it);
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Link href="/cierre" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Todos los meses
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">
            Cierre de {MESES[mes]} {anio}
            {bloqueado && (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-500">
                cerrado
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-start gap-2">
          {!bloqueado && <RegenerarMesBtn anio={anio} mes={mes} />}
          <CerrarMesBtn cierreId={cierre.id} cerrado={bloqueado} />
        </div>
      </div>

      {/* Avance */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-neutral-600">
            {cierre.listos} de {cierre.total} listos
            {cierre.pendientes > 0 && <span className="text-amber-600"> · faltan {cierre.pendientes}</span>}
          </span>
          <span className="font-semibold text-neutral-900">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-neutral-800"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-6">
        {grupos.map((g) => (
          <div key={g.grupo} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
              {g.grupo}
            </div>
            <div className="divide-y divide-neutral-100">
              {g.items.map((it) => (
                <CierreItemRow
                  key={it.item_id}
                  item={it}
                  archivos={archivosMap.get(it.item_id) ?? []}
                  bloqueado={bloqueado}
                  anio={anio}
                  mes={mes}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
