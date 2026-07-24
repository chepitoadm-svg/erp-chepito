import Link from "next/link";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarAsientos } from "@/lib/data/asientos";
import type { AsientoEstado } from "@/types/database";

const ESTILO_ESTADO: Record<AsientoEstado, string> = {
  borrador: "bg-amber-50 text-amber-700",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-600",
  descartado: "bg-neutral-100 text-neutral-400",
};

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AsientosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (!(await tienePermiso("asientos.ver"))) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No tenés permiso para ver asientos contables.
      </div>
    );
  }

  const { estado } = await searchParams;
  const filtroEstado = (["borrador", "confirmado", "anulado", "descartado"] as const).find(
    (e) => e === estado,
  );

  const [asientos, puedeCrear] = await Promise.all([
    listarAsientos(filtroEstado ? { estado: filtroEstado } : undefined),
    tienePermiso("asientos.crear"),
  ]);

  const filtros: { k: string; label: string }[] = [
    { k: "", label: "Todos" },
    { k: "borrador", label: "Borradores" },
    { k: "confirmado", label: "Confirmados" },
    { k: "anulado", label: "Anulados" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Asientos contables</h1>
          <p className="text-sm text-neutral-500">Libro Diario.</p>
        </div>
        {puedeCrear && (
          <Link
            href="/asientos/nuevo"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nuevo asiento
          </Link>
        )}
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        {filtros.map((f) => {
          const activo = (estado ?? "") === f.k;
          return (
            <Link
              key={f.k}
              href={f.k ? `/asientos?estado=${f.k}` : "/asientos"}
              className={`rounded-full px-3 py-1 ${
                activo ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Número</th>
              <th className="px-4 py-3 font-medium">Glosa</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {asientos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No hay asientos {filtroEstado ? `en estado ${filtroEstado}` : "todavía"}.
                </td>
              </tr>
            )}
            {asientos.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/asientos/${a.id}`} className="block text-neutral-900">
                    {a.fecha}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600">{a.tipo}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {a.numero ? `${a.tipo.slice(0, 3).toUpperCase()}-${a.anio}-${a.numero}` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-700">{a.glosa}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {money(a.total)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ESTILO_ESTADO[a.estado]}`}
                  >
                    {a.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
