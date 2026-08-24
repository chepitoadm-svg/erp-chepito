import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarCxP, listarProveedoresDeCxP, type CxPFiltro, type CxPOrden } from "@/lib/data/compras";
import { listarCentrosCosto } from "@/lib/data/asientos";
import { numeroFactura } from "@/lib/compras/numeroFactura";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  pagada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

function hoyCR(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type SP = { proveedor?: string; desde?: string; hasta?: string; centro?: string; estado?: string; orden?: string };

export default async function CxPPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const puedePagar = await tienePermiso("compras.pagar");
  const sp = await searchParams;

  const orden = (["venc_asc", "venc_desc", "monto_asc", "monto_desc"].includes(sp.orden ?? "")
    ? sp.orden
    : "venc_asc") as CxPOrden;
  const filtro: CxPFiltro = {
    proveedorId: sp.proveedor || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    centroId: sp.centro || undefined,
    estado: sp.estado || undefined,
    orden,
  };
  const hayFiltro = !!(filtro.proveedorId || filtro.desde || filtro.hasta || filtro.centroId || filtro.estado);

  const [cxp, proveedores, centros] = await Promise.all([
    listarCxP(filtro),
    listarProveedoresDeCxP(),
    listarCentrosCosto(),
  ]);
  const hoy = hoyCR();
  const totalPendiente = cxp.filter((q) => q.estado === "pendiente").reduce((s, q) => s + q.saldo, 0);

  // URL para ordenar conservando los filtros actuales.
  const hrefOrden = (o: CxPOrden) => {
    const p = new URLSearchParams();
    if (sp.proveedor) p.set("proveedor", sp.proveedor);
    if (sp.desde) p.set("desde", sp.desde);
    if (sp.hasta) p.set("hasta", sp.hasta);
    if (sp.centro) p.set("centro", sp.centro);
    if (sp.estado) p.set("estado", sp.estado);
    p.set("orden", o);
    return `/compras/cxp?${p.toString()}`;
  };
  const flechaVenc = orden === "venc_asc" ? "▲" : orden === "venc_desc" ? "▼" : "↕";
  const flechaMonto = orden === "monto_asc" ? "▲" : orden === "monto_desc" ? "▼" : "↕";

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Cuentas por pagar</h1>
          <p className="text-sm text-neutral-500">Saldos con proveedores, por vencimiento.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras/notas-credito/nueva"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            + Nota de crédito
          </Link>
          {puedePagar && (
            <Link
              href="/compras/pagos/nuevo"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Registrar pago
            </Link>
          )}
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
        <input type="hidden" name="orden" value={orden} />
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Proveedor
          <select
            name="proveedor"
            defaultValue={sp.proveedor ?? ""}
            className="min-w-[200px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Centro de costo
          <select
            name="centro"
            defaultValue={sp.centro ?? ""}
            className="min-w-[150px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Vence desde
          <input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Vence hasta
          <input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Estado
          <select
            name="estado"
            defaultValue={sp.estado ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagada">Pagada</option>
            <option value="anulada">Anulada</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Filtrar
          </button>
          {hayFiltro && (
            <Link href="/compras/cxp" className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
              Limpiar
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">
                <Link href={hrefOrden(orden === "venc_asc" ? "venc_desc" : "venc_asc")} className="hover:text-neutral-800">
                  Vencimiento <span className={orden.startsWith("venc") ? "text-neutral-700" : "text-neutral-300"}>{flechaVenc}</span>
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Factura</th>
              <th className="px-4 py-3 font-medium">Centro</th>
              <th className="px-4 py-3 text-right font-medium">Original</th>
              <th className="px-4 py-3 text-right font-medium">
                <Link href={hrefOrden(orden === "monto_desc" ? "monto_asc" : "monto_desc")} className="hover:text-neutral-800">
                  Saldo <span className={orden.startsWith("monto") ? "text-neutral-700" : "text-neutral-300"}>{flechaMonto}</span>
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {cxp.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  {hayFiltro ? "Ninguna cuenta por pagar coincide con los filtros." : "No hay cuentas por pagar."}
                </td>
              </tr>
            )}
            {cxp.map((q) => {
              const vencida = q.estado === "pendiente" && q.fecha_vencimiento && q.fecha_vencimiento < hoy;
              return (
                <tr key={q.id}>
                  <td className="px-4 py-3 text-neutral-600">
                    {q.fecha_vencimiento ?? "—"}
                    {vencida && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">vencida</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">{q.proveedor_nombre}</td>
                  <td className="px-4 py-3">
                    {q.tipo === "credito" ? (
                      q.nota_credito_id ? (
                        <Link
                          href={`/compras/notas-credito/${q.nota_credito_id}`}
                          className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200"
                        >
                          Nota de crédito
                        </Link>
                      ) : (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">Nota de crédito</span>
                      )
                    ) : q.factura_id ? (
                      <Link
                        href={`/compras/facturas/${q.factura_id}`}
                        className="font-mono text-xs text-neutral-600 underline hover:text-neutral-900"
                      >
                        {numeroFactura(q.factura_clave) ?? "ver"}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {q.centro_codigo ?? <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmt(q.monto_original)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${q.saldo < 0 ? "text-green-700" : "text-neutral-900"}`}>
                    {fmt(q.saldo)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[q.estado] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {q.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {q.pagos.length === 1 ? (
                      <Link href={`/compras/pagos/${q.pagos[0].id}`} className="text-neutral-600 hover:text-neutral-900">
                        Ver pago
                      </Link>
                    ) : q.pagos.length > 1 ? (
                      <Link href={`/compras/facturas/${q.factura_id}`} className="text-neutral-600 hover:text-neutral-900">
                        {q.pagos.length} pagos
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {cxp.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-medium text-neutral-700">
                  Total pendiente ({cxp.filter((q) => q.estado === "pendiente").length})
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{fmt(totalPendiente)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
