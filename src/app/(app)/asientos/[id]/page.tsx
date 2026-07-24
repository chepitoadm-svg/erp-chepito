import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerAsiento } from "@/lib/data/asientos";
import { confirmarAsiento, descartarAsiento } from "../actions";
import AnularAsiento from "@/components/AnularAsiento";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AsientoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("asientos.ver"))) redirect("/asientos");

  const { id } = await params;
  const [asiento, puedeCrear, puedeConfirmar, puedeAnular] = await Promise.all([
    obtenerAsiento(id),
    tienePermiso("asientos.crear"),
    tienePermiso("asientos.confirmar"),
    tienePermiso("asientos.anular"),
  ]);

  if (!asiento) notFound();

  const totalD = asiento.lineas.reduce((s, l) => s + Number(l.debito), 0);
  const totalC = asiento.lineas.reduce((s, l) => s + Number(l.credito), 0);
  const numero = asiento.numero
    ? `${asiento.tipo.slice(0, 3).toUpperCase()}-${asiento.anio}-${asiento.numero}`
    : "sin numerar";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/asientos" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← Asientos
          </Link>
          <h1 className="mt-1 text-lg font-semibold capitalize text-neutral-900">
            {asiento.tipo} · {asiento.fecha}
          </h1>
          <p className="text-sm text-neutral-500">
            {numero} · periodo {asiento.anio}-{String(asiento.mes).padStart(2, "0")} ({asiento.periodo_estado})
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${
            asiento.estado === "confirmado"
              ? "bg-green-50 text-green-700"
              : asiento.estado === "borrador"
                ? "bg-amber-50 text-amber-700"
                : asiento.estado === "anulado"
                  ? "bg-red-50 text-red-600"
                  : "bg-neutral-100 text-neutral-400"
          }`}
        >
          {asiento.estado}
        </span>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-700">
          <span className="text-neutral-500">Glosa:</span> {asiento.glosa}
        </p>
      </div>

      {asiento.anulacion && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Anulado ({asiento.anulacion.fecha_reversion}): {asiento.anulacion.motivo}.{" "}
          <Link href={`/asientos/${asiento.anulacion.reversion_id}`} className="underline">
            Ver reversión
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Cuenta</th>
              <th className="px-4 py-2 font-medium">Centro</th>
              <th className="px-4 py-2 text-right font-medium">Débito</th>
              <th className="px-4 py-2 text-right font-medium">Crédito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {asiento.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-2 text-neutral-400">{l.linea}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900">{l.cuenta_codigo}</div>
                  <div className="text-xs text-neutral-500">{l.cuenta_nombre}</div>
                  {l.detalle && <div className="text-xs text-neutral-400">{l.detalle}</div>}
                </td>
                <td className="px-4 py-2 text-neutral-600">{l.centro_codigo ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(l.debito) > 0 ? money(Number(l.debito)) : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(l.credito) > 0 ? money(Number(l.credito)) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 font-medium">
            <tr>
              <td className="px-4 py-2" colSpan={3}>
                Totales
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{money(totalD)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(totalC)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Acciones según el estado */}
      <div className="flex flex-wrap items-start gap-3">
        {asiento.estado === "borrador" && (
          <>
            {puedeCrear && (
              <Link
                href={`/asientos/${asiento.id}/editar`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Editar
              </Link>
            )}
            {puedeConfirmar && (
              <form action={confirmarAsiento}>
                <input type="hidden" name="id" value={asiento.id} />
                <button
                  type="submit"
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Confirmar
                </button>
              </form>
            )}
            {puedeCrear && (
              <form action={descartarAsiento}>
                <input type="hidden" name="id" value={asiento.id} />
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-900"
                >
                  Descartar
                </button>
              </form>
            )}
          </>
        )}
        {asiento.estado === "confirmado" && puedeAnular && asiento.tipo !== "reversion" && (
          <AnularAsiento id={asiento.id} />
        )}
      </div>
    </div>
  );
}
