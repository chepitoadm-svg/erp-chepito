import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { obtenerConciliacion } from "@/lib/data/conciliaciones";
import { listarCuentasPosteables, listarCentrosCosto } from "@/lib/data/asientos";
import { listarProveedoresActivos } from "@/lib/data/compras";
import { marcarConciliada, reabrirConciliacion } from "../actions";
import ConciliadorPanel from "@/components/ConciliadorPanel";
import AnularConciliacion from "@/components/AnularConciliacion";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-600",
  conciliada: "bg-green-50 text-green-700",
  anulada: "bg-red-50 text-red-700",
};

export default async function ConciliacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("tesoreria.conciliar"))) redirect("/");
  const { id } = await params;
  const [c, cuentasRaw, centros, proveedoresRaw] = await Promise.all([
    obtenerConciliacion(id),
    listarCuentasPosteables(),
    listarCentrosCosto(),
    listarProveedoresActivos(),
  ]);
  if (!c) notFound();
  const proveedores = (proveedoresRaw as { id: string; nombre: string }[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));

  const cuentas = cuentasRaw.map((x: { id: string; codigo: string; nombre: string }) => ({
    value: x.id,
    label: `${x.codigo} — ${x.nombre}`,
  }));
  const editable = c.estado === "borrador";

  const totalLineas = c.lineas.length;
  const conciliadas = c.lineas.filter((l) => l.estado === "conciliada").length;
  const diferencia = Math.round((c.saldo_final - c.saldo_libros) * 100) / 100;
  const calza = Math.abs(diferencia) < 0.005;

  return (
    <div>
      <Link href="/tesoreria/conciliaciones" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Conciliaciones
      </Link>

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {c.cuenta_codigo} — corte {c.fecha_corte}
          </h1>
          <p className="text-sm text-neutral-500">{c.cuenta_nombre}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${ESTADO_CLS[c.estado]}`}>{c.estado}</span>
      </div>

      {/* Resumen de saldos */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Saldo banco</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(c.saldo_final)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Saldo en libros</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{money(c.saldo_libros)}</div>
        </div>
        <div className={`rounded-lg border p-3 ${calza ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="text-xs text-neutral-500">Diferencia</div>
          <div className={`text-base font-semibold tabular-nums ${calza ? "text-green-700" : "text-amber-700"}`}>{money(diferencia)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="text-xs text-neutral-500">Conciliadas</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">
            {conciliadas}/{totalLineas}
          </div>
        </div>
      </div>

      {!calza && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El saldo del banco y el de libros aún no calzan (diferencia ₡{money(diferencia)}). Casá las líneas de abajo:
          elegí una de cada lado y &ldquo;Conciliar seleccionados&rdquo;, o creá el asiento faltante desde la línea del banco.
        </p>
      )}

      <ConciliadorPanel
        conciliacionId={c.id}
        lineas={c.lineas}
        movimientos={c.movimientos_sin_conciliar}
        cuentas={cuentas}
        centros={centros}
        editable={editable}
        proveedores={proveedores}
      />

      {editable && (
        <div className="mt-6 flex items-center gap-3">
          <form action={marcarConciliada}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Marcar conciliada
            </button>
          </form>
          <AnularConciliacion id={c.id} />
        </div>
      )}
      {c.estado === "conciliada" && (
        <div className="mt-6 flex items-center gap-3">
          <form action={reabrirConciliacion}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reabrir para editar
            </button>
          </form>
          <AnularConciliacion id={c.id} />
        </div>
      )}
    </div>
  );
}
