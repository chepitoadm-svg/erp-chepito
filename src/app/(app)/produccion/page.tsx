import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarRecetas, listarInsumosManuales } from "@/lib/data/recetas";
import { alternarInsumoEstado } from "./actions";

const money = (n: number | null) =>
  n == null ? "—" : "₡" + Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (c: number | null, u: string | null) =>
  c == null ? "—" : `${Number(c).toLocaleString("es-CR", { maximumFractionDigits: 3 })} ${u ?? ""}`.trim();

export default async function ProduccionPage() {
  if (!(await tienePermiso("produccion.ver"))) redirect("/");
  const puedeGestionar = await tienePermiso("produccion.gestionar");

  // Si la migración de la Fase 4-1 todavía no se aplicó (tablas/vistas no existen),
  // mostramos un aviso en vez de reventar (admin pasa el guard por bypass).
  let recetas: Awaited<ReturnType<typeof listarRecetas>>;
  let insumos: Awaited<ReturnType<typeof listarInsumosManuales>>;
  try {
    [recetas, insumos] = await Promise.all([listarRecetas(), listarInsumosManuales()]);
  } catch {
    return (
      <div>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Producción — Recetas y costos</h1>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          El módulo de Producción todavía no está disponible: falta aplicar la migración de la base
          (<code>supabase db push</code>). Una vez aplicada, esta pantalla carga las recetas y costos.
        </div>
      </div>
    );
  }

  const productos = recetas.filter((r) => r.es_producto);
  const intermedias = recetas.filter((r) => !r.es_producto);

  return (
    <div>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Producción — Recetas y costos</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Fichas de costo por producto, armadas con insumos y recetas (BOM). El costo sale del promedio
        ponderado del inventario, o del costo manual cuando el insumo todavía no está en el inventario.
      </p>

      {/* PRODUCTOS FINALES */}
      <h2 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Productos ({productos.length})
      </h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Clasificación</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
              <th className="px-4 py-3 text-right font-medium">Margen</th>
              <th className="px-4 py-3 text-right font-medium">%</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {productos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay productos. (Crear/editar llega en el próximo incremento.)
                </td>
              </tr>
            )}
            {productos.map((p) => (
              <tr key={p.id} className={p.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3 text-neutral-900">{p.nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{p.clasificacion ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{money(p.precio_venta)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{money(p.costo)}</td>
                <td
                  className={
                    "px-4 py-3 text-right tabular-nums " +
                    (p.margen == null ? "text-neutral-400" : p.margen >= 0 ? "text-green-700" : "text-red-700")
                  }
                >
                  {money(p.margen)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {p.margen_pct == null ? "—" : p.margen_pct.toLocaleString("es-CR", { maximumFractionDigits: 1 }) + "%"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      p.estado === "activo"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {p.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RECETAS INTERMEDIAS */}
      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Recetas intermedias ({intermedias.length})
      </h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Receta</th>
              <th className="px-4 py-3 font-medium">Clasificación</th>
              <th className="px-4 py-3 text-right font-medium">Rinde</th>
              <th className="px-4 py-3 text-right font-medium">Costo total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {intermedias.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay recetas intermedias.
                </td>
              </tr>
            )}
            {intermedias.map((r) => (
              <tr key={r.id} className={r.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3 text-neutral-900">{r.nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{r.clasificacion ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {qty(r.rinde_cantidad, r.rinde_unidad)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{money(r.costo)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      r.estado === "activo"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {r.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* INSUMOS MANUALES */}
      <div className="mt-8 mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Insumos manuales ({insumos.length})
          <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
            — MP que todavía no está en el inventario
          </span>
        </h2>
        {puedeGestionar && (
          <Link
            href="/produccion/insumos/nuevo"
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            ＋ Nuevo insumo
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Insumo</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 text-right font-medium">Compra</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              {puedeGestionar && <th className="px-4 py-3 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {insumos.length === 0 && (
              <tr>
                <td colSpan={puedeGestionar ? 5 : 4} className="px-4 py-8 text-center text-neutral-400">
                  Sin insumos manuales. (Los de inventario se usan directo como artículo.)
                </td>
              </tr>
            )}
            {insumos.map((i) => (
              <tr key={i.id} className={i.estado === "inactivo" ? "opacity-50" : ""}>
                <td className="px-4 py-3 text-neutral-900">{i.nombre}</td>
                <td className="px-4 py-3 text-neutral-600">{i.proveedor ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {money(i.costo_compra)} / {qty(i.cantidad_compra, i.unidad)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      i.estado === "activo"
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {i.estado}
                  </span>
                </td>
                {puedeGestionar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/produccion/insumos/${i.id}`}
                        className="text-xs text-neutral-600 hover:text-neutral-900"
                      >
                        Editar
                      </Link>
                      <form action={alternarInsumoEstado}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="estado" value={i.estado} />
                        <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-900">
                          {i.estado === "activo" ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
