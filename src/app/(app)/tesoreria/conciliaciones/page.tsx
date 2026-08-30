import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarConciliaciones } from "@/lib/data/conciliaciones";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  conciliada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function ConciliacionesPage() {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/");
  const cs = await listarConciliaciones();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Conciliaciones bancarias</h1>
          <p className="text-sm text-neutral-500">
            Amarra los movimientos de libros contra el estado de cuenta real del banco.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tesoreria/datafono" className="text-sm text-neutral-500 hover:text-neutral-900">
            💳 Liquidación datafono
          </Link>
          <Link href="/tesoreria/proveedores-banco" className="text-sm text-neutral-500 hover:text-neutral-900">
            🏷️ Proveedores por cuenta
          </Link>
          <Link
            href="/tesoreria/conciliaciones/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nueva conciliación
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Corte</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-right font-medium">Saldo banco</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay conciliaciones.
                </td>
              </tr>
            )}
            {cs.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-neutral-600">{c.fecha_corte}</td>
                <td className="px-4 py-3 text-neutral-800">
                  {c.cuenta_codigo} · {c.cuenta_nombre}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{money(c.saldo_final)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>{c.estado}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/tesoreria/conciliaciones/${c.id}`} className="text-neutral-600 hover:text-neutral-900">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
