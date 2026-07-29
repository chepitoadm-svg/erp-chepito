import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarRecepciones } from "@/lib/data/compras";

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  confirmada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function RecepcionesPage() {
  if (!(await tienePermiso("compras.recibir"))) redirect("/compras");
  const recepciones = await listarRecepciones();

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Recepciones</h1>
          <p className="text-sm text-neutral-500">
            Recibir mercadería sin factura todavía. La factura llega después y salda la cuenta puente.
          </p>
        </div>
        <Link
          href="/compras/recepciones/nueva"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nueva recepción
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Bodega</th>
              <th className="px-4 py-3 text-right font-medium">Líneas</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Facturada</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {recepciones.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay recepciones.
                </td>
              </tr>
            )}
            {recepciones.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-neutral-600">{r.fecha}</td>
                <td className="px-4 py-3 text-neutral-900">{r.proveedor_nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{r.bodega_codigo}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{r.n_lineas}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[r.estado]}`}>
                    {r.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {r.facturada ? "sí" : r.estado === "confirmada" ? "pendiente" : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/compras/recepciones/${r.id}`}
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
