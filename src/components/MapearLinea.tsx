"use client";

import { useActionState, useMemo, useState } from "react";
import { mapearLinea, type FormState } from "@/app/(app)/compras/actions";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
  porcentaje?: number;
}

interface Props {
  ingestaId: string;
  codigoComercial: string;
  detalle: string;
  cantidad: number;
  unidadComercial: string | null;
  articulos: Opcion[];
  unidades: Opcion[];
  tarifas: Opcion[];
}

const inicial: FormState = {};
const inputCls =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

// "CC 250ML PET 12U" / "HI-C UVA 330 ML (24U)" -> sugiere 12 / 24.
function factorSugerido(detalle: string): string {
  const m = detalle.match(/(\d+)\s*U\b/i);
  return m ? m[1] : "1";
}

export default function MapearLinea({
  ingestaId,
  codigoComercial,
  detalle,
  cantidad,
  unidadComercial,
  articulos,
  unidades,
  tarifas,
}: Props) {
  const [state, formAction, pending] = useActionState(mapearLinea, inicial);
  const [modo, setModo] = useState<"existente" | "nuevo">("existente");

  const iva13 = tarifas.find((t) => t.porcentaje === 13)?.id ?? tarifas[0]?.id ?? "";
  const unUnidad = unidades.find((u) => u.codigo === "UN")?.id ?? unidades[0]?.id ?? "";
  // Unidad de compra sugerida: la del XML (CJ/BOT/…) si existe en el catálogo.
  const unidadCompraSug = useMemo(() => {
    const hit = unidadComercial ? unidades.find((u) => u.codigo === unidadComercial) : undefined;
    return hit?.id ?? "";
  }, [unidadComercial, unidades]);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-amber-200 bg-amber-50/40 p-3"
    >
      <input type="hidden" name="ingesta_id" value={ingestaId} />
      <input type="hidden" name="codigo_comercial" value={codigoComercial} />
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="descripcion" value={detalle} />

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm text-neutral-800">
          <span className="font-mono text-xs text-neutral-600">{codigoComercial}</span> — {detalle}
          <span className="ml-2 text-xs text-neutral-500">
            ({cantidad} {unidadComercial})
          </span>
        </div>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} />
            Artículo existente
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={modo === "nuevo"} onChange={() => setModo("nuevo")} />
            Crear nuevo
          </label>
        </div>
      </div>

      {modo === "existente" ? (
        <div className="mb-2">
          <select name="articulo_id" defaultValue="" className={inputCls + " w-full sm:w-96"}>
            <option value="">Elegí el artículo…</option>
            {articulos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} — {a.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap gap-2">
          <input
            name="nuevo_codigo"
            defaultValue={codigoComercial}
            placeholder="Código"
            className={inputCls + " w-28 uppercase"}
          />
          <input
            name="nuevo_nombre"
            defaultValue={detalle}
            placeholder="Nombre"
            className={inputCls + " w-64"}
          />
          <select name="nuevo_unidad_stock_id" defaultValue={unUnidad} className={inputCls} title="Unidad de stock">
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                stock: {u.codigo}
              </option>
            ))}
          </select>
          <select name="nuevo_iva_tarifa_id" defaultValue={iva13} className={inputCls} title="IVA">
            {tarifas.map((t) => (
              <option key={t.id} value={t.id}>
                IVA {t.porcentaje}%
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-neutral-500">Unidad de compra</label>
          <select name="unidad_compra_id" defaultValue={unidadCompraSug} className={inputCls + " w-28"}>
            <option value="">…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Factor a stock</label>
          <input
            name="factor_a_stock"
            type="number"
            step="any"
            min="0"
            defaultValue={factorSugerido(detalle)}
            className={inputCls + " w-24 text-right"}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Mapear"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Factor = cuántas unidades de stock trae cada unidad de compra (ej. 1 CJ = 12 UN). Se aprende
        para las próximas facturas de este proveedor.
      </p>
    </form>
  );
}
