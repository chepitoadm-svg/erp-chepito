import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerConciliacion } from "@/lib/data/conciliaciones";
import { listarCuentasPosteables, listarCentrosCosto } from "@/lib/data/asientos";
import { marcarConciliada } from "../actions";
import LineaBancoAccion from "@/components/LineaBancoAccion";
import AnularConciliacion from "@/components/AnularConciliacion";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  conciliada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function ConciliacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/");
  const { id } = await params;
  const [c, cuentasRaw, centros] = await Promise.all([
    obtenerConciliacion(id),
    listarCuentasPosteables(),
    listarCentrosCosto(),
  ]);
  if (!c) notFound();

  const cuentas = cuentasRaw.map((x: { id: string; codigo: string; nombre: string }) => ({
    value: x.id,
    label: `${x.codigo} — ${x.nombre}`,
  }));
  const editable = c.estado === "borrador";

  const totalLineas = c.lineas.length;
  const conciliadas = c.lineas.filter((l) => l.estado === "conciliada").length;
  const pendientes = totalLineas - conciliadas;
  const diferencia = Math.round((c.saldo_final - c.saldo_libros) * 100) / 100;

  return (
    <div>
      <Link href="/tesoreria/conciliaciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Conciliaciones
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {c.cuenta_codigo} — corte {c.fecha_corte}
          </h1>
          <p className="text-sm text-neutral-500">{c.cuenta_nombre}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[c.estado]}`}>{c.estado}</span>
      </div>

      {/* Resumen de saldos */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Saldo banco</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(c.saldo_final)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Saldo en libros</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(c.saldo_libros)}</div>
        </div>
        <div className={`rounded-lg border p-3 ${Math.abs(diferencia) < 0.005 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="text-xs text-neutral-500">Diferencia</div>
          <div className={`text-base font-semibold tabular-nums ${Math.abs(diferencia) < 0.005 ? "text-green-700" : "text-amber-700"}`}>
            {money(diferencia)}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Conciliadas</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">
            {conciliadas}/{totalLineas}
          </div>
        </div>
      </div>

      {Math.abs(diferencia) >= 0.005 && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El saldo del banco y el de libros aún no calzan (diferencia ₡{money(diferencia)}). Registrá o emparejá las{" "}
          {pendientes} líneas pendientes; la diferencia debería llegar a 0.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 text-right font-medium">Débito</th>
              <th className="px-3 py-2 text-right font-medium">Crédito</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 text-right font-medium">Estado / acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {c.lineas.map((l) => {
              const compat = c.movimientos_sin_conciliar.filter(
                (m) =>
                  Math.round(m.credito * 100) === Math.round(l.debito * 100) &&
                  Math.round(m.debito * 100) === Math.round(l.credito * 100),
              );
              return (
                <tr key={l.id} className={l.estado === "conciliada" ? "bg-green-50/30" : ""}>
                  <td className="px-3 py-2 text-neutral-600">{l.fecha}</td>
                  <td className="px-3 py-2 text-neutral-700">
                    {l.codigo && <span className="mr-1 rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">{l.codigo}</span>}
                    {l.descripcion}
                    {l.referencia && <span className="ml-1 text-xs text-neutral-400">· {l.referencia}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{l.debito ? money(l.debito) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">{l.credito ? money(l.credito) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{l.balance != null ? money(l.balance) : ""}</td>
                  <td className="px-3 py-2 text-right align-top">
                    <LineaBancoAccion linea={l} cuentas={cuentas} centros={centros} movsCompatibles={compat} editable={editable} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="mt-6 flex items-center gap-3">
          <form action={marcarConciliada}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Marcar conciliada
            </button>
          </form>
          <AnularConciliacion id={c.id} />
        </div>
      )}
      {c.estado === "conciliada" && (
        <div className="mt-6">
          <AnularConciliacion id={c.id} />
        </div>
      )}
    </div>
  );
}
