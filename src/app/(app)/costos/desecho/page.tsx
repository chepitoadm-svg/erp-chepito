import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarDesechoMeses } from "@/lib/data/desecho";
import DesechoTablero from "@/components/DesechoTablero";

const fmt = (n: number) => n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return m ? `${MESES[m - 1]} ${y}` : p;
};

export default async function DesechoPage() {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/costos");
  const meses = await listarDesechoMeses();
  return (
    <div>
      <Link href="/costos" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Costos
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Desecho del mes</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Subí el Excel de movimientos de inventario (QuPOS) y marcá qué tipos de movimiento son desecho (mercadería
        dañada, autoconsumo, etc.). El sistema suma la cantidad por producto, le jala el costo desde la app de
        producción, y te da el total de desecho de la panadería. Los productos <b>sin receta</b> te los lista para que
        los vayás completando.
      </p>

      {/* Historial de meses guardados */}
      {meses.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800">
            Meses guardados
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Mes</th>
                <th className="px-4 py-2 font-medium">Panadería</th>
                <th className="px-4 py-2 text-right font-medium">Costo neto</th>
                <th className="px-4 py-2 text-right font-medium">Merma</th>
                <th className="px-4 py-2 text-right font-medium">Autoconsumo</th>
                <th className="px-4 py-2 text-right font-medium">Costo vendido</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {meses.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-neutral-700">{etiquetaMes(m.periodo)}</td>
                  <td className="px-4 py-2 text-neutral-800">{m.centro_codigo ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">₡{fmt(m.compras_total)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-700">₡{fmt(m.merma)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-700">₡{fmt(m.autoconsumo)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">₡{fmt(m.costo_vendido)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.posteado ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {m.posteado ? "posteado" : "borrador"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/costos/desecho/${m.id}`} className="text-neutral-600 hover:text-neutral-900">
                      Ver artículos
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DesechoTablero />
    </div>
  );
}
