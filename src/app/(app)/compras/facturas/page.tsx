import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFacturas, listarProveedoresDeFacturas, type FacturasFiltro } from "@/lib/data/compras";
import { listarCentrosCosto } from "@/lib/data/asientos";
import ComprasFacturasTabla from "@/components/ComprasFacturasTabla";

const fmt = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SP = { proveedor?: string; desde?: string; hasta?: string; centro?: string; estado?: string; pago?: string };

export default async function FacturasPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const sp = await searchParams;

  const filtro: FacturasFiltro = {
    proveedorId: sp.proveedor || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    centroId: sp.centro || undefined,
    estado: (sp.estado as FacturasFiltro["estado"]) || undefined,
  };
  const pagoFiltro = sp.pago && ["pagada", "vencida", "pendiente"].includes(sp.pago) ? sp.pago : "";
  const hayFiltro = !!(
    filtro.proveedorId ||
    filtro.desde ||
    filtro.hasta ||
    filtro.centroId ||
    filtro.estado ||
    pagoFiltro
  );

  const [facturasTodas, proveedores, centros] = await Promise.all([
    listarFacturas(filtro),
    listarProveedoresDeFacturas(),
    listarCentrosCosto(),
  ]);
  const facturas = pagoFiltro ? facturasTodas.filter((f) => f.pago === pagoFiltro) : facturasTodas;

  const vivas = facturas.filter((f) => f.estado !== "anulada");
  const totBase = vivas.reduce((s, f) => s + f.subtotal, 0);
  const totIva = vivas.reduce((s, f) => s + f.iva, 0);
  const total = vivas.reduce((s, f) => s + f.total, 0);

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <div className="mt-1 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Facturas de compra</h1>
          <p className="text-sm text-neutral-500">
            Registrar la factura del proveedor: trae la mercadería y crea la cuenta por pagar.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras/facturas/nueva-gasto"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            + Gasto
          </Link>
          <Link
            href="/compras/facturas/nueva"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Compra (inventario)
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
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
            className="min-w-[160px] rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
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
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
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
            <option value="confirmada">Confirmada</option>
            <option value="borrador">Borrador</option>
            <option value="anulada">Anulada</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Pago
          <select
            name="pago"
            defaultValue={sp.pago ?? ""}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencida">Vencida</option>
            <option value="pagada">Pagada</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Filtrar
          </button>
          {hayFiltro && (
            <Link
              href="/compras/facturas"
              className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {facturas.length === 0 && !hayFiltro ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          Todavía no hay facturas.
        </div>
      ) : (
        <ComprasFacturasTabla facturas={facturas} />
      )}

      {facturas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          <span className="text-xs text-neutral-500">
            {vivas.length} factura{vivas.length !== 1 ? "s" : ""} (sin anuladas)
          </span>
          <span>
            Base sin IVA <strong className="tabular-nums">{fmt(totBase)}</strong>
          </span>
          <span>
            IVA <strong className="tabular-nums">{fmt(totIva)}</strong>
          </span>
          <span>
            Total con IVA <strong className="tabular-nums">{fmt(total)}</strong>
          </span>
        </div>
      )}

      {facturas.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          La <strong>Base sin IVA</strong> es lo que aparece como compras en el Estado de Resultados (el IVA es un
          crédito recuperable, no un costo). El <strong>Total con IVA</strong> es lo que se le debe al proveedor (la
          cuenta por pagar).
        </p>
      )}
    </div>
  );
}
