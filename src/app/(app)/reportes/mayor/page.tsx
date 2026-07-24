import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { mayorCuenta } from "@/lib/data/reportes";
import { listarCuentasPosteables } from "@/lib/data/asientos";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MayorPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; desde?: string; hasta?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const cuentas = await listarCuentasPosteables();
  const cuentaId = sp.cuenta || "";
  const cuentaSel = cuentas.find((c) => c.id === cuentaId);
  const desde = sp.desde || "";
  const hasta = sp.hasta || "";

  const movs = cuentaId ? await mayorCuenta(cuentaId, desde || undefined, hasta || undefined) : [];

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Libro Mayor</h1>
      <p className="mb-4 text-sm text-neutral-500">Movimientos y saldo acumulado de una cuenta.</p>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Cuenta</label>
          <select name="cuenta" defaultValue={cuentaId} className="min-w-[280px] rounded-md border border-neutral-300 px-2 py-1.5">
            <option value="">Elegí una cuenta…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Ver
        </button>
      </form>

      {!cuentaId ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Elegí una cuenta para ver su mayor.
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">
            {cuentaSel?.codigo} — {cuentaSel?.nombre}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Asiento</th>
                  <th className="px-3 py-2 text-left font-medium">Glosa</th>
                  <th className="px-3 py-2 text-right font-medium">Débito</th>
                  <th className="px-3 py-2 text-right font-medium">Crédito</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                      Sin movimientos confirmados en el rango.
                    </td>
                  </tr>
                )}
                {movs.map((m, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5 text-neutral-600">{m.fecha}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/asientos/${m.asiento_id}`} className="text-neutral-700 hover:text-neutral-900">
                        {m.asiento_numero ? `${m.asiento_tipo.slice(0, 3).toUpperCase()}-${m.asiento_numero}` : m.asiento_tipo}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-neutral-600">
                      {m.glosa}
                      {m.centro_codigo ? <span className="ml-1 text-xs text-neutral-400">[{m.centro_codigo}]</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                      {Number(m.debito) ? money(Number(m.debito)) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                      {Number(m.credito) ? money(Number(m.credito)) : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-neutral-800">
                      {money(Number(m.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
