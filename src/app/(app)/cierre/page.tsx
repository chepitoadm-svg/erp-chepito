import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCierres } from "@/lib/data/cierre";
import AbrirMesForm from "@/components/AbrirMesForm";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function CierrePage() {
  if (!(await tienePermiso("cierre.gestionar"))) redirect("/");
  const cierres = await listarCierres();
  const hoy = new Date();

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Cierre mensual</h1>
          <p className="text-sm text-neutral-500">
            Qué documentos y tareas de la conta ya están y cuáles faltan, mes por mes. Subí acá los
            archivos de cada mes.{" "}
            <Link href="/cierre/requisitos" className="underline">
              Editar checklist
            </Link>
          </p>
        </div>
        <AbrirMesForm anioActual={hoy.getFullYear()} mesActual={hoy.getMonth() + 1} />
      </div>

      {cierres.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Todavía no abriste ningún mes. Elegí uno arriba y dale “Abrir mes”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Mes</th>
                <th className="px-4 py-3 font-medium">Avance</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {cierres.map((c) => {
                const pct = c.total > 0 ? Math.round((c.listos / c.total) * 100) : 0;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {MESES[c.mes]} {c.anio}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-neutral-800"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500">
                          {c.listos}/{c.total}
                          {c.pendientes > 0 ? ` · faltan ${c.pendientes}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.estado === "cerrado" ? "bg-neutral-100 text-neutral-500" : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {c.estado === "cerrado" ? "cerrado" : "en proceso"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/cierre/${c.anio}/${c.mes}`} className="text-neutral-600 hover:text-neutral-900">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
