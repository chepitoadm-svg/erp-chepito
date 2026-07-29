import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerTransferencia } from "@/lib/data/inventario";
import { enviarTransferencia } from "../../actions";
import RecibirTransferencia from "@/components/RecibirTransferencia";
import AnularTransferencia from "@/components/AnularTransferencia";

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

export default async function TransferenciaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("inventario.ver"))) redirect("/inventario");
  const { id } = await params;
  const [t, puedeTransferir] = await Promise.all([
    obtenerTransferencia(id),
    tienePermiso("inventario.transferir"),
  ]);
  if (!t) notFound();

  const pendientes = t.lineas.filter((l) => l.pendiente > 0);

  return (
    <div>
      <Link
        href="/inventario/transferencias"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← Transferencias
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {t.origen_codigo} → {t.destino_codigo}
          </h1>
          <p className="text-sm text-neutral-500">
            {t.fecha}
            {t.glosa ? ` · ${t.glosa}` : ""}
          </p>
          <p className="text-xs text-neutral-400">
            {t.origen_nombre} → {t.destino_nombre}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[t.estado]}`}>
          {ESTADO_LBL[t.estado]}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 text-right font-medium">Enviado</th>
              <th className="px-4 py-3 text-right font-medium">Recibido</th>
              <th className="px-4 py-3 text-right font-medium">Pendiente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {t.lineas.map((l) => (
              <tr key={l.linea}>
                <td className="px-4 py-3 text-neutral-900">
                  <span className="font-mono text-xs text-neutral-600">{l.articulo_codigo}</span> —{" "}
                  {l.articulo_nombre}
                  {l.detalle && <span className="block text-xs text-neutral-400">{l.detalle}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad_enviada)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.cantidad_recibida)}
                </td>
                <td
                  className={
                    "px-4 py-3 text-right tabular-nums " +
                    (l.pendiente > 0 ? "text-amber-700" : "text-neutral-400")
                  }
                >
                  {fmt(l.pendiente)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Acciones según el estado */}
      {puedeTransferir && t.estado === "borrador" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action={enviarTransferencia}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Enviar
            </button>
          </form>
          <span className="text-sm text-neutral-500">
            Saca la mercadería del origen y la deja en tránsito.
          </span>
          <AnularTransferencia id={t.id} enTransito={false} />
        </div>
      )}

      {puedeTransferir && t.estado === "en_transito" && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-medium text-neutral-800">Recibir en {t.destino_codigo}</h2>
          <RecibirTransferencia
            id={t.id}
            lineas={pendientes.map((l) => ({
              linea: l.linea,
              articulo_codigo: l.articulo_codigo,
              articulo_nombre: l.articulo_nombre,
              pendiente: l.pendiente,
            }))}
          />
          <AnularTransferencia id={t.id} enTransito={true} />
        </div>
      )}
    </div>
  );
}
