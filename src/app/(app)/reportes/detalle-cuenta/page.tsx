import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { detalleCuenta } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";
import BotonVolver from "@/components/BotonVolver";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Link al DOCUMENTO de origen (el gasto / la factura), no al asiento.
function hrefOrigen(origen_tipo: string | null, origen_id: string | null): string | null {
  if (!origen_id) return null;
  if (origen_tipo === "gasto") return `/gastos/${origen_id}`;
  if (origen_tipo === "factura_compra") return `/compras/facturas/${origen_id}`;
  return null;
}

export default async function DetalleCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; desde?: string; hasta?: string; centro?: string; prorrateo?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const cuentaId = sp.cuenta || "";
  const desde = sp.desde || "";
  const hasta = sp.hasta || "";
  const centro = sp.centro || "";
  const sinProrrateo = sp.prorrateo === "no";

  const cuentas = await listarCuentasPosteables();
  const cuentaSel = cuentas.find((c) => c.id === cuentaId);

  const todas = cuentaId ? await detalleCuenta(cuentaId, desde || undefined, hasta || undefined, sinProrrateo) : [];
  const lineas = centro ? todas.filter((l) => l.centro_codigo === centro) : todas;
  const total = lineas.reduce((s, l) => s + l.monto, 0);

  return (
    <div>
      <BotonVolver fallback="/reportes/resultados" />
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Detalle de cuenta</h1>
      <p className="mb-3 text-sm text-neutral-500">
        Qué compone esta cuenta en el periodo (los ítems con su descripción, no los asientos).
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-neutral-800">
          {cuentaSel ? `${cuentaSel.codigo} — ${cuentaSel.nombre}` : "Elegí una cuenta desde el Estado de Resultados"}
        </h2>
        {centro && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Centro: {centro}</span>
        )}
        {(desde || hasta) && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
            {fechaCR(desde) || "…"} a {fechaCR(hasta) || "…"}
          </span>
        )}
        {sinProrrateo && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">sin prorrateo</span>}
        {cuentaId && (
          <Link
            href={(() => {
              const p = new URLSearchParams({ cuenta: cuentaId });
              if (desde) p.set("desde", desde);
              if (hasta) p.set("hasta", hasta);
              if (centro) p.set("centro", centro);
              if (sinProrrateo) p.set("prorrateo", "no");
              return `/reportes/mayor?${p.toString()}`;
            })()}
            className="ml-auto rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50"
            title="Ver la vista contable (Libro Mayor)"
          >
            Ver en el Mayor
          </Link>
        )}
      </div>

      {!cuentaId ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Entrá desde una línea del Estado de Resultados para ver su detalle.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
                {!centro && <th className="px-4 py-2 font-medium">Centro</th>}
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={centro ? 4 : 5} className="px-4 py-8 text-center text-neutral-400">
                    Sin movimientos en el periodo.
                  </td>
                </tr>
              )}
              {lineas.map((l, i) => {
                const href = hrefOrigen(l.origen_tipo, l.origen_id);
                return (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-600">{fechaCR(l.fecha)}</td>
                    <td className="px-4 py-2 text-neutral-800">{l.descripcion}</td>
                    {!centro && (
                      <td className="px-4 py-2 text-neutral-500">
                        {l.centro_codigo ?? <span className="text-neutral-300">—</span>}
                      </td>
                    )}
                    <td className={`px-4 py-2 text-right tabular-nums ${l.monto < 0 ? "text-red-600" : "text-neutral-900"}`}>
                      {l.monto < 0 ? `(${money(-l.monto)})` : money(l.monto)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {href && (
                        <Link href={href} className="text-xs text-neutral-500 underline hover:text-neutral-900">
                          abrir
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lineas.length > 0 && (
              <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-800">
                <tr>
                  <td className="px-4 py-2" colSpan={centro ? 2 : 3}>
                    Total ({lineas.length} ítem{lineas.length !== 1 ? "s" : ""})
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
