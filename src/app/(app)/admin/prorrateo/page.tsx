import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import {
  listarPeriodos,
  estadoProrrateo,
  listarCentrosFinales,
  centrosPorCuenta,
  cuentasProrrateo,
  type CuentaProrrateo,
} from "@/lib/data/admin";
import ProrrateoBases from "@/components/ProrrateoBases";
import GenerarProrrateoBtn from "@/components/GenerarProrrateoBtn";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default async function ProrrateoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  if (!(await tienePermiso("prorrateo.gestionar"))) redirect("/admin");

  const periodos = await listarPeriodos(2026);
  const sp = await searchParams;
  // Por defecto, el primer periodo abierto.
  const periodoSel =
    periodos.find((p) => p.id === sp.periodo) ??
    periodos.find((p) => p.estado === "abierto") ??
    periodos[0];

  const [centros, finales, porCuentaIds] = await Promise.all([
    estadoProrrateo(periodoSel.id),
    listarCentrosFinales(),
    centrosPorCuenta(),
  ]);
  const porCuenta = new Set(porCuentaIds);
  // Para los centros "por cuenta" (General), traer sus cuentas con saldo.
  const cuentasPorCentro = new Map<string, CuentaProrrateo[]>();
  await Promise.all(
    centros
      .filter((c) => porCuenta.has(c.centro_id))
      .map(async (c) => {
        cuentasPorCentro.set(c.centro_id, await cuentasProrrateo(periodoSel.id, c.centro_id));
      }),
  );

  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Administración
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Prorrateo</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Reparte el gasto de los centros intermedios hacia los canales. El asiento
        se genera en borrador para revisarlo.
      </p>

      <form method="get" className="mb-5 flex items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Periodo</label>
          <select
            name="periodo"
            defaultValue={periodoSel.id}
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {MESES[p.mes]} {p.anio} ({p.estado})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Ver
        </button>
      </form>

      <div className="space-y-4">
        {centros.length === 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
            No hay centros intermedios activos.
          </div>
        )}
        {centros.map((c) => {
          const esPorCuenta = porCuenta.has(c.centro_id);
          const cuentas = cuentasPorCentro.get(c.centro_id) ?? [];
          const suma100 = Math.abs(Number(c.suma_bases) - 100) < 0.005;
          // Por cuenta: cada cuenta con saldo debe sumar 100. Centro: la suma del centro.
          const todasCuadran = esPorCuenta
            ? cuentas.every((q) => Math.abs(Number(q.suma_bases) - 100) < 0.005)
            : suma100;
          const puedeGenerar = todasCuadran && Number(c.pool) !== 0 && periodoSel.estado === "abierto";
          return (
            <div key={c.centro_id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-neutral-900">
                    {c.codigo} — {c.nombre}
                  </span>
                  {c.requiere_prorrateo && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      se prorratea
                    </span>
                  )}
                  {esPorCuenta && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">por cuenta</span>
                  )}
                </div>
                <div className="text-sm text-neutral-500">
                  Pool acumulado:{" "}
                  <span className="font-medium tabular-nums text-neutral-800">{money(Number(c.pool))}</span>
                </div>
              </div>

              {esPorCuenta ? (
                cuentas.length === 0 ? (
                  <p className="text-sm text-neutral-400">No hay cuentas con saldo en este centro este mes.</p>
                ) : (
                  <div className="space-y-4">
                    {cuentas.map((q) => (
                      <div key={q.cuenta_id} className="rounded-md border border-neutral-100 bg-neutral-50/50 p-3">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-medium text-neutral-800">
                            <span className="font-mono text-xs text-neutral-500">{q.codigo}</span> {q.nombre}
                          </span>
                          <span className="tabular-nums text-neutral-600">{money(Number(q.pool))}</span>
                        </div>
                        <ProrrateoBases
                          periodoId={periodoSel.id}
                          origenId={c.centro_id}
                          cuentaId={q.cuenta_id}
                          finales={finales}
                          inicial={q.bases}
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <ProrrateoBases periodoId={periodoSel.id} origenId={c.centro_id} finales={finales} inicial={c.bases} />
              )}

              <div className="mt-3 border-t border-neutral-100 pt-3">
                <GenerarProrrateoBtn
                  periodoId={periodoSel.id}
                  origenId={c.centro_id}
                  disabled={!puedeGenerar}
                  title={
                    !todasCuadran
                      ? esPorCuenta
                        ? "Cada cuenta debe sumar 100%"
                        : "Las bases deben sumar 100"
                      : Number(c.pool) === 0
                        ? "No hay saldo que prorratear"
                        : periodoSel.estado !== "abierto"
                          ? "El periodo no está abierto"
                          : undefined
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
