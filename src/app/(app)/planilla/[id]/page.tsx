import Link from "next/link";
import { fechaCR } from "@/lib/fecha";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerPlanilla, listarBancos, type PlanillaLinea, type Destino } from "@/lib/data/planilla";
import PlanillaAcciones from "@/components/PlanillaAcciones";
import AnularPagoBtn from "@/components/AnularPagoBtn";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DEST_LBL: Record<Destino, string> = { TAL: "Taller", CH1: "Chepito 1", CH2: "Chepito 2", DIV: "Dividir 1 y 2", CAS: "Casa" };
const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};
const neto = (l: PlanillaLinea) =>
  l.salario_base - l.rebajos + l.pago_adicional - l.ccss_obrero - l.embargo - l.adelanto;

export default async function PlanillaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("gastos.registrar"))) redirect("/");
  const { id } = await params;
  const [p, bancos] = await Promise.all([obtenerPlanilla(id), listarBancos()]);
  if (!p) notFound();

  const totNeto = p.lineas.reduce((s, l) => s + neto(l), 0);
  const totBase = p.lineas.reduce((s, l) => s + l.salario_base, 0);
  const totRebajos = p.lineas.reduce((s, l) => s + l.rebajos, 0);
  const totEmbargo = p.lineas.reduce((s, l) => s + l.embargo, 0);

  return (
    <div>
      <Link href="/planilla" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Planilla
      </Link>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-900">{p.titulo ?? "Planilla"}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[p.estado]}`}>{p.estado}</span>
        <span className="text-sm text-neutral-400">{fechaCR(p.fecha)}{p.quincena ? ` · ${p.quincena}ª quincena` : ""}</span>
        <span className="text-sm text-neutral-400">Reparto Dividir: {p.reparto_ch1}% CH1 / {100 - p.reparto_ch1}% CH2</span>
      </div>

      {/* Estado contable */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3">
          <div className="text-xs text-neutral-500">Neto a pagar (efectivo)</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-900">₡{fmt(p.neto_total)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Pagado</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-700">₡{fmt(p.pagado)}</div>
        </div>
        <div className={`rounded-lg border p-3 ${p.saldo > 0.005 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          <div className={`text-xs ${p.saldo > 0.005 ? "text-amber-700" : "text-green-700"}`}>Saldo pendiente</div>
          <div className={`text-lg font-semibold tabular-nums ${p.saldo > 0.005 ? "text-amber-800" : "text-green-800"}`}>
            ₡{fmt(p.saldo)}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Provisión (asiento)</div>
          <div className="text-sm font-medium text-neutral-800">
            {p.asiento_numero && p.asiento_id ? (
              <Link href={`/asientos/${p.asiento_id}`} className="text-neutral-700 underline hover:text-neutral-900">
                Ver asiento #{p.asiento_numero}
              </Link>
            ) : (
              "sin postear"
            )}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Adelantos (pago simulado)</div>
          <div className="text-sm font-medium text-neutral-800">
            {p.adelanto_asiento_numero && p.adelanto_asiento_id ? (
              <Link href={`/asientos/${p.adelanto_asiento_id}`} className="text-neutral-700 underline hover:text-neutral-900">
                Ver asiento #{p.adelanto_asiento_numero} · ₡{fmt(p.adelanto_total)}
              </Link>
            ) : p.adelanto_total > 0 ? (
              `₡${fmt(p.adelanto_total)}`
            ) : (
              "sin adelantos"
            )}
          </div>
        </div>
      </div>

      {/* Acciones */}
      {(p.estado === "borrador" || p.estado === "confirmada") && (
        <div className="mb-6">
          <PlanillaAcciones id={p.id} estado={p.estado} saldo={p.saldo} bancos={bancos} fechaDefault={p.fecha} />
        </div>
      )}

      {/* Pagos realizados */}
      {p.pagos.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
            Pagos ({p.pagos.filter((x) => x.estado === "confirmado").length})
          </div>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Cuenta</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">Asiento</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {p.pagos.map((pg) => (
                <tr key={pg.id} className={pg.estado === "anulado" ? "opacity-50" : ""}>
                  <td className="px-4 py-2 text-neutral-600">{fechaCR(pg.fecha)}</td>
                  <td className="px-4 py-2 text-neutral-700">
                    {pg.cuenta_codigo} · {pg.cuenta_nombre}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">₡{fmt(pg.monto)}</td>
                  <td className="px-4 py-2">
                    {pg.asiento_numero && pg.asiento_id ? (
                      <Link href={`/asientos/${pg.asiento_id}`} className="text-neutral-600 underline hover:text-neutral-900">
                        #{pg.asiento_numero}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${pg.estado === "confirmado" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {pg.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {pg.estado === "confirmado" && p.estado === "confirmada" && (
                      <AnularPagoBtn pagoId={pg.id} planillaId={p.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Colaboradores */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Colaborador</th>
              <th className="px-3 py-2 font-medium">CCSS</th>
              <th className="px-3 py-2 font-medium">Destino</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">Rebajos</th>
              <th className="px-3 py-2 text-right font-medium">Embargo</th>
              <th className="px-3 py-2 text-right font-medium">CCSS obr.</th>
              <th className="px-3 py-2 text-right font-medium">Cargas pat.</th>
              <th className="px-3 py-2 text-right font-medium">Adicional</th>
              <th className="px-3 py-2 text-right font-medium">Adelanto</th>
              <th className="px-3 py-2 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {p.lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-1.5 text-neutral-800">
                  {l.nombre ?? "—"}
                  {l.puesto ? <span className="block text-xs text-neutral-400">{l.puesto}</span> : null}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${l.tiene_ccss ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                    {l.tiene_ccss ? "Sí" : "No"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-neutral-600">{DEST_LBL[l.destino]}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">{fmt(l.salario_base)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{l.rebajos ? `-${fmt(l.rebajos)}` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">{l.embargo ? `-${fmt(l.embargo)}` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.ccss_obrero ? fmt(l.ccss_obrero) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.cargas_patronal ? fmt(l.cargas_patronal) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.pago_adicional ? fmt(l.pago_adicional) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{l.adelanto ? fmt(l.adelanto) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-neutral-900">{fmt(neto(l))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-neutral-300 bg-neutral-50">
            <tr>
              <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-neutral-700">
                {p.lineas.length} colaboradores
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">{fmt(totBase)}</td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-red-600">
                {totRebajos ? `-${fmt(totRebajos)}` : ""}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-amber-700">
                {totEmbargo ? `-${fmt(totEmbargo)}` : ""}
              </td>
              <td colSpan={4} />
              <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">{fmt(totNeto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
