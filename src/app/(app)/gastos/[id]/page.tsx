import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerGasto, bancoDeAsiento } from "@/lib/data/gastos";
import { confirmarGasto } from "../actions";
import AnularGasto from "@/components/AnularGasto";
import BotonVolver from "@/components/BotonVolver";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmado: "bg-green-50 text-green-700",
  anulado: "bg-red-50 text-red-700",
};

export default async function GastoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const { id } = await params;
  const g = await obtenerGasto(id);
  if (!g) notFound();
  const banco = g.asiento_id ? await bancoDeAsiento(g.asiento_id) : [];

  return (
    <div>
      <BotonVolver fallback="/gastos" />

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Gasto {g.centro_codigo} — {fechaCR(g.fecha)}
          </h1>
          <p className="text-sm text-neutral-500">
            {g.cuenta_codigo} · {g.cuenta_nombre}
          </p>
          {g.descripcion && <p className="text-xs text-neutral-400">{g.descripcion}</p>}
        </div>
        <div className="flex items-center gap-3">
          {g.estado !== "anulado" && (
            <Link
              href={`/gastos/${g.id}/editar`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Editar
            </Link>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[g.estado]}`}>{g.estado}</span>
        </div>
      </div>

      {g.asiento_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Asiento:{" "}
          <Link
            href={`/asientos/${g.asiento_id}`}
            className="font-medium text-neutral-900 underline hover:no-underline"
          >
            {g.asiento_numero ? `#${g.asiento_numero}` : "ver"}
          </Link>
        </p>
      )}

      <div className="max-w-md overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            <tr>
              <td className="px-4 py-3 text-neutral-600">Centro de costo</td>
              <td className="px-4 py-3 text-right text-neutral-800">
                {g.centro_codigo} — {g.centro_nombre}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">Cuenta de gasto</td>
              <td className="px-4 py-3 text-right text-neutral-800">{g.cuenta_nombre}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">
                {g.proveedor_nombre ? "Por pagar a" : "Pago / contrapartida"}
              </td>
              <td className="px-4 py-3 text-right text-neutral-800">
                {g.proveedor_nombre ?? g.pago_nombre}
              </td>
            </tr>
            {g.proveedor_nombre && (
              <tr>
                <td className="px-4 py-3 text-neutral-600">Vence</td>
                <td className="px-4 py-3 text-right text-neutral-800">{fechaCR(g.fecha_vencimiento) || "—"}</td>
              </tr>
            )}
            <tr>
              <td className="px-4 py-3 text-neutral-600">Monto</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(g.subtotal)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-neutral-600">IVA acreditable</td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-800">{fmt(g.iva)}</td>
            </tr>
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="px-4 py-3 font-medium text-neutral-700">Total</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                {fmt(g.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {g.proveedor_nombre && g.estado === "confirmado" && (
        <p className="mt-3 max-w-md rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Deuda por pagar a <b>{g.proveedor_nombre}</b>. Saldala en <b>Compras → Pagos</b>.
        </p>
      )}

      {/* Movimiento en banco: de dónde salió la plata y si ya se concilió */}
      {banco.length > 0 && (
        <div className="mt-6 max-w-md">
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Movimiento en banco</h2>
          <div className="space-y-2">
            {banco.map((b, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">
                    {b.credito > 0 ? "Salió de" : "Entró a"} {b.cuenta_nombre}
                  </span>
                  <span className="font-medium tabular-nums text-neutral-900">
                    {fmt(b.credito > 0 ? b.credito : b.debito)}
                  </span>
                </div>
                {b.lineas.length > 0 ? (
                  <div className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-900">
                    <div className="mb-1 font-medium">
                      ✓ Conciliado con {b.lineas.length} línea{b.lineas.length !== 1 ? "s" : ""} del estado de cuenta:
                    </div>
                    <ul className="space-y-0.5">
                      {b.lineas.map((e, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="mt-0.5 text-green-600">•</span>
                          <span className="flex-1">
                            <b>{fechaCR(e.fecha)}</b>
                            {e.referencia ? ` · ${e.referencia}` : ""}
                            {e.descripcion ? ` · ${e.descripcion}` : ""}
                          </span>
                          <span className="tabular-nums">{fmt(e.debito > 0 ? e.debito : e.credito)}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/tesoreria/conciliaciones/${b.lineas[0].conciliacion_id}`}
                      className="mt-1 inline-block underline hover:no-underline"
                    >
                      ver conciliación
                    </Link>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-400">Aún no conciliado con el estado de cuenta del banco.</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {g.estado === "borrador" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={confirmarGasto}>
            <input type="hidden" name="id" value={g.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Confirmar y postear
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Debe {g.cuenta_codigo} ({g.centro_codigo}) / Haber {g.pago_codigo}.
          </span>
        </div>
      )}

      {g.estado === "confirmado" && (
        <div className="mt-6">
          <AnularGasto id={g.id} />
        </div>
      )}
    </div>
  );
}
