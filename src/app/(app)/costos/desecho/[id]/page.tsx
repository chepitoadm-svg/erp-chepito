import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerDesechoMes, type DesechoLinea } from "@/lib/data/desecho";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return m ? `${MESES[m - 1]} ${y}` : p;
};

const CLASE_CLS: Record<DesechoLinea["clase"], string> = {
  merma: "bg-red-50 text-red-700",
  autoconsumo: "bg-amber-50 text-amber-700",
  ignorar: "bg-neutral-100 text-neutral-500",
};
const CLASE_LBL: Record<DesechoLinea["clase"], string> = {
  merma: "Merma",
  autoconsumo: "Autoconsumo",
  ignorar: "—",
};

export default async function DesechoMesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/costos");
  const { id } = await params;
  const mes = await obtenerDesechoMes(id);
  if (!mes) notFound();

  // Agrupado por clase (desecho primero), dentro por costo desc.
  const ORDEN: DesechoLinea["clase"][] = ["merma", "autoconsumo", "ignorar"];
  const grupos = ORDEN.map((clase) => {
    const filas = mes.lineas
      .filter((l) => l.clase === clase)
      .sort((a, b) => (b.costo_total ?? 0) - (a.costo_total ?? 0));
    const cantidad = filas.reduce((s, l) => s + l.cantidad, 0);
    const total = filas.reduce((s, l) => s + (l.costo_total ?? 0), 0);
    return { clase, filas, cantidad, total: Math.round(total * 100) / 100 };
  }).filter((g) => g.filas.length > 0);
  const granTotal = Math.round(grupos.reduce((s, g) => s + g.total, 0) * 100) / 100;
  const sinReceta = mes.lineas.filter((l) => l.clase !== "ignorar" && l.costo_unitario == null).length;

  return (
    <div>
      <Link href="/costos/desecho" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Desecho del mes
      </Link>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-neutral-900">
          Desecho {mes.centro_codigo ?? ""} — {etiquetaMes(mes.periodo)}
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            mes.posteado ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {mes.posteado ? "posteado" : "borrador"}
        </span>
        {mes.bodega && <span className="text-sm text-neutral-400">{mes.bodega}</span>}
      </div>

      {/* Resumen */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3">
          <div className="text-xs text-neutral-500">Costo del mes (neto)</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-900">₡{fmt(mes.compras_total)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Costo de lo vendido</div>
          <div className="text-lg font-semibold tabular-nums text-neutral-800">₡{fmt(mes.costo_vendido)}</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">💀 Merma (desecho)</div>
          <div className="text-lg font-semibold tabular-nums text-red-800">₡{fmt(mes.merma)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">🏠 Autoconsumo</div>
          <div className="text-lg font-semibold tabular-nums text-amber-800">₡{fmt(mes.autoconsumo)}</div>
        </div>
      </div>

      {sinReceta > 0 && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sinReceta} artículo{sinReceta === 1 ? "" : "s"} de desecho sin receta (sin costo) en este mes. Al armar la
          receta en la app de producción y volver a guardar el mes, se costean solos.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Artículo</th>
              <th className="px-4 py-2 font-medium">Tipo movimiento</th>
              <th className="px-4 py-2 font-medium">Clase</th>
              <th className="px-4 py-2 text-right font-medium">Cantidad</th>
              <th className="px-4 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-4 py-2 text-right font-medium">Costo total</th>
            </tr>
          </thead>
          {grupos.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Este mes no tiene artículos guardados.
                </td>
              </tr>
            </tbody>
          ) : (
            grupos.map((g) => (
              <tbody key={g.clase} className="divide-y divide-neutral-100 border-t border-neutral-200">
                {g.filas.map((l, i) => (
                  <tr key={`${l.codigo}-${l.tipo_mov}-${i}`}>
                    <td className="px-4 py-1.5 font-mono text-xs text-neutral-500">{l.codigo}</td>
                    <td className="px-4 py-1.5 text-neutral-800">{l.nombre ?? "—"}</td>
                    <td className="px-4 py-1.5 text-neutral-500">{l.tipo_mov ?? "—"}</td>
                    <td className="px-4 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CLASE_CLS[l.clase]}`}>{CLASE_LBL[l.clase]}</span>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-neutral-600">{fmtQty(l.cantidad)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-neutral-600">
                      {l.costo_unitario == null ? <span className="text-amber-600">sin receta</span> : `₡${fmt(l.costo_unitario)}`}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium text-neutral-900">
                      {l.costo_total == null ? "—" : `₡${fmt(l.costo_total)}`}
                    </td>
                  </tr>
                ))}
                <tr className="bg-neutral-50/70">
                  <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-neutral-700">
                    Subtotal {CLASE_LBL[g.clase]} <span className="font-normal text-neutral-400">({g.filas.length})</span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-neutral-600">{fmtQty(g.cantidad)}</td>
                  <td />
                  <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">₡{fmt(g.total)}</td>
                </tr>
              </tbody>
            ))
          )}
          {grupos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 bg-neutral-100">
                <td colSpan={6} className="px-4 py-2 text-sm font-bold text-neutral-800">
                  Total con costo
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-neutral-900">₡{fmt(granTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
