import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerIngesta } from "@/lib/data/compras";
import { descartarIngesta } from "../../actions";

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
  validado: "listo para crear factura",
  requiere_mapeo: "requiere mapeo",
  procesado: "factura creada",
  error: "error",
  descartado: "descartado",
};
const COND: Record<string, string> = { "01": "Contado", "02": "Crédito" };

export default async function IngestaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const { id } = await params;
  const c = await obtenerIngesta(id);
  if (!c) notFound();

  const sinMapear = c.lineas.filter((l) => !l.mapeado).length;

  return (
    <div>
      <Link href="/compras/ingestor" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Ingestor
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{c.emisor_nombre ?? "Comprobante"}</h1>
          <p className="text-sm text-neutral-500">
            {c.fecha_emision ?? "—"}
            {c.condicion_venta ? ` · ${COND[c.condicion_venta] ?? c.condicion_venta}` : ""}
            {c.plazo_credito ? ` (${c.plazo_credito} d, vence ${c.fecha_vencimiento})` : ""}
          </p>
          <p className="break-all text-xs text-neutral-400">clave {c.clave ?? "—"}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[c.estado]}`}>
            {ESTADO_LBL[c.estado]}
          </span>
          {c.estado_hacienda && (
            <span className="text-xs text-neutral-500">Hacienda: {c.estado_hacienda}</span>
          )}
        </div>
      </div>

      {c.error_detalle && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            c.estado === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {c.error_detalle}
          {c.estado === "error" && !c.proveedor_id && c.emisor_cedula && (
            <>
              {" "}
              <Link href="/compras/proveedores" className="underline">
                Registrar proveedor
              </Link>{" "}
              (céd. {c.emisor_cedula}) y volver a subirlo.
            </>
          )}
        </div>
      )}

      {c.factura_id && (
        <p className="mb-4 text-sm text-neutral-600">
          Factura creada:{" "}
          <Link href={`/compras/facturas/${c.factura_id}`} className="font-medium text-neutral-900 underline hover:no-underline">
            ver factura
          </Link>
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Dato label="Proveedor" valor={c.proveedor_nombre ?? "sin registrar"} />
        <Dato label="Subtotal" valor={fmt(c.subtotal)} />
        <Dato label="IVA" valor={fmt(c.iva_total)} />
        <Dato label="Total" valor={fmt(c.total)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cód. comercial</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Base</th>
              <th className="px-4 py-3 text-right font-medium">IVA</th>
              <th className="px-4 py-3 font-medium">Artículo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {c.lineas.map((l) => (
              <tr key={l.numero}>
                <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                  {l.codigo_comercial ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-800">
                  {l.detalle}
                  <span className="block text-xs text-neutral-400">
                    {l.cantidad} {l.unidad_comercial}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{l.cantidad}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.base_imponible)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {fmt(l.iva_monto)}
                </td>
                <td className="px-4 py-3">
                  {l.mapeado ? (
                    <span className="text-neutral-800">{l.articulo_codigo}</span>
                  ) : (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      sin mapear
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.estado === "requiere_mapeo" && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Faltan {sinMapear} de {c.lineas.length} líneas por ligar a un artículo. El mapeo y la
          creación automática de la factura llegan en la próxima entrega; por ahora podés crear la
          factura a mano desde{" "}
          <Link href="/compras/facturas/nueva" className="underline">
            Nueva factura
          </Link>
          .
        </p>
      )}

      {c.estado !== "descartado" && c.estado !== "procesado" && (
        <div className="mt-6">
          <form action={descartarIngesta}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Descartar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums text-neutral-900">{valor}</div>
    </div>
  );
}
