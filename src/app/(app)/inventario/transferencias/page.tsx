import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarTransferencias, inventarioTransito } from "@/lib/data/inventario";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  en_transito: "bg-amber-50 text-amber-700",
  recibida: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};
const ESTADO_LBL: Record<string, string> = {
  borrador: "borrador",
  en_transito: "en tránsito",
  recibida: "recibida",
  anulada: "anulada",
};

export default async function TransferenciasPage() {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const [puedeTransferir, transferencias, transito] = await Promise.all([
    tienePermiso("inventario.transferir"),
    listarTransferencias(),
    inventarioTransito(),
  ]);

  return (
    <div>
      <Link href="/inventario" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Inventario
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Transferencias</h1>
          <p className="text-sm text-neutral-500">
            Mercadería entre bodegas, en dos pasos. No mueve el valor total, solo de lugar.
          </p>
        </div>
        {puedeTransferir && (
          <Link
            href="/inventario/transferencias/nuevo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nueva transferencia
          </Link>
        )}
      </div>

      {transito.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-800">En tránsito</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-amber-700/70">
                <tr>
                  <th className="py-1 pr-4 font-medium">Ruta</th>
                  <th className="py-1 pr-4 font-medium">Artículo</th>
                  <th className="py-1 text-right font-medium">En tránsito</th>
                </tr>
              </thead>
              <tbody>
                {transito.map((t, i) => (
                  <tr key={`${t.transferencia_id}-${i}`} className="text-amber-900">
                    <td className="py-1 pr-4">
                      {t.origen} → {t.destino}
                    </td>
                    <td className="py-1 pr-4">
                      {t.articulo_codigo} — {t.articulo_nombre}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmt(t.en_transito)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Ruta</th>
              <th className="px-4 py-3 font-medium">Glosa</th>
              <th className="px-4 py-3 text-right font-medium">Líneas</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {transferencias.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay transferencias.
                </td>
              </tr>
            )}
            {transferencias.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-neutral-600">{t.fecha}</td>
                <td className="px-4 py-3 text-neutral-800">
                  {t.origen_codigo} → {t.destino_codigo}
                </td>
                <td className="px-4 py-3 text-neutral-600">{t.glosa ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{t.n_lineas}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[t.estado]}`}>
                    {ESTADO_LBL[t.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/inventario/transferencias/${t.id}`}
                    className="text-neutral-600 hover:text-neutral-900"
                  >
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
