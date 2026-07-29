import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarIngesta } from "@/lib/data/compras";
import SubirComprobante from "@/components/SubirComprobante";

const fmt = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  recibido: "bg-neutral-100 text-neutral-600",
  validado: "bg-blue-50 text-blue-700",
  requiere_mapeo: "bg-amber-50 text-amber-700",
  procesado: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
  descartado: "bg-neutral-100 text-neutral-400",
};
const ESTADO_LBL: Record<string, string> = {
  recibido: "recibido",
  validado: "listo para crear",
  requiere_mapeo: "requiere mapeo",
  procesado: "factura creada",
  error: "error",
  descartado: "descartado",
};

export default async function IngestorPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const comprobantes = await listarIngesta();

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Ingestor de XML</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Subí el XML de la factura electrónica de Hacienda y su respuesta. El sistema lo lee,
        valida y prepara la factura de compra.
      </p>

      <div className="mb-6">
        <SubirComprobante />
      </div>

      <h2 className="mb-2 text-sm font-medium text-neutral-800">Bandeja</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Emisión</th>
              <th className="px-4 py-3 font-medium">Emisor</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {comprobantes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no se subió ningún comprobante.
                </td>
              </tr>
            )}
            {comprobantes.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-neutral-600">{c.fecha_emision ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-900">{c.emisor_nombre ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {c.proveedor_nombre ?? <span className="text-red-600">sin registrar</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{fmt(c.total)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[c.estado]}`}>
                    {ESTADO_LBL[c.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/compras/ingestor/${c.id}`}
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
