"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { crearFactura, type FormState } from "@/app/(app)/compras/actions";

interface Articulo {
  id: string;
  codigo: string;
  nombre: string;
  iva_tarifa_id?: string;
}
interface Tarifa {
  id: string;
  codigo: string;
  nombre: string;
  porcentaje: number;
}
interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}
interface Proveedor {
  id: string;
  nombre: string;
  condicion_venta_default: string | null;
  plazo_credito_default: number | null;
}
interface Linea {
  articulo_id: string;
  cantidad: string;
  costo_unitario: string;
  iva_tarifa_id: string;
  detalle: string;
}

interface Props {
  proveedores: Proveedor[];
  bodegas: Bodega[];
  articulos: Articulo[];
  tarifas: Tarifa[];
  // Modo "salda una recepción" (caso B): proveedor y bodega fijos, líneas
  // precargadas desde la recepción (el costo se puede ajustar por diferencia).
  recepcion?: { id: string; proveedor_nombre: string; bodega_codigo: string };
  lineasIniciales?: {
    articulo_id: string;
    cantidad: number;
    costo_unitario: number;
    iva_tarifa_id: string;
  }[];
}

const lineaVacia = (ivaDefault: string): Linea => ({
  articulo_id: "",
  cantidad: "",
  costo_unitario: "",
  iva_tarifa_id: ivaDefault,
  detalle: "",
});
const hoy = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const estadoInicial: FormState = {};

export default function FacturaForm({
  proveedores,
  bodegas,
  articulos,
  tarifas,
  recepcion,
  lineasIniciales,
}: Props) {
  const [state, formAction, pending] = useActionState(crearFactura, estadoInicial);
  const ivaDefault = tarifas.find((t) => t.porcentaje === 13)?.id ?? tarifas[0]?.id ?? "";
  const modoRecepcion = !!recepcion;

  const [proveedor, setProveedor] = useState("");
  const [bodega, setBodega] = useState("");
  const [clave, setClave] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState("");
  const [plazo, setPlazo] = useState("");
  const [lineas, setLineas] = useState<Linea[]>(
    lineasIniciales && lineasIniciales.length
      ? lineasIniciales.map((l) => ({
          articulo_id: l.articulo_id,
          cantidad: String(l.cantidad),
          costo_unitario: String(l.costo_unitario),
          iva_tarifa_id: l.iva_tarifa_id || ivaDefault,
          detalle: "",
        }))
      : [lineaVacia(ivaDefault)],
  );

  const pctPorTarifa = useMemo(() => {
    const m = new Map<string, number>();
    tarifas.forEach((t) => m.set(t.id, Number(t.porcentaje)));
    return m;
  }, [tarifas]);
  const ivaArticulo = useMemo(() => {
    const m = new Map<string, string>();
    articulos.forEach((a) => a.iva_tarifa_id && m.set(a.id, a.iva_tarifa_id));
    return m;
  }, [articulos]);

  function onProveedor(id: string) {
    setProveedor(id);
    const p = proveedores.find((x) => x.id === id);
    if (p) {
      setCondicion(p.condicion_venta_default ?? "");
      setPlazo(p.plazo_credito_default != null ? String(p.plazo_credito_default) : "");
    }
  }

  function setLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => {
      const next = [...prev];
      const l = { ...next[i], [campo]: valor };
      // Al elegir artículo, hereda su tarifa de IVA por defecto.
      if (campo === "articulo_id") {
        const iva = ivaArticulo.get(valor);
        if (iva) l.iva_tarifa_id = iva;
      }
      next[i] = l;
      return next;
    });
  }

  const calc = lineas.map((l) => {
    const base = Math.round((parseFloat(l.cantidad) || 0) * (parseFloat(l.costo_unitario) || 0) * 100) / 100;
    const iva = Math.round(base * (pctPorTarifa.get(l.iva_tarifa_id) ?? 0)) / 100;
    return { base, iva };
  });
  const subtotal = calc.reduce((s, x) => s + x.base, 0);
  const ivaTotal = calc.reduce((s, x) => s + x.iva, 0);
  const total = subtotal + ivaTotal;

  const lineasJSON = JSON.stringify(
    lineas
      .filter((l) => l.articulo_id && parseFloat(l.cantidad) > 0 && l.iva_tarifa_id)
      .map((l) => ({
        articulo_id: l.articulo_id,
        cantidad: parseFloat(l.cantidad),
        costo_unitario: parseFloat(l.costo_unitario) || 0,
        iva_tarifa_id: l.iva_tarifa_id,
        detalle: l.detalle || null,
      })),
  );
  const listo =
    (modoRecepcion || (proveedor && bodega)) && JSON.parse(lineasJSON).length > 0;

  const inputCls =
    "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="proveedor_id" value={proveedor} />
      <input type="hidden" name="bodega_id" value={bodega} />
      <input type="hidden" name="clave" value={clave} />
      <input type="hidden" name="fecha_emision" value={fecha} />
      <input type="hidden" name="condicion_venta" value={condicion} />
      <input type="hidden" name="plazo_credito" value={plazo} />
      <input type="hidden" name="lineas" value={lineasJSON} />
      {recepcion && <input type="hidden" name="recepcion_id" value={recepcion.id} />}

      {modoRecepcion ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="text-neutral-700">
            Salda la recepción de <span className="font-medium">{recepcion!.proveedor_nombre}</span>{" "}
            (bodega {recepcion!.bodega_codigo}). La mercadería ya entró; esta factura ajusta
            cualquier diferencia de precio y crea la cuenta por pagar.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Proveedor</label>
            <select value={proveedor} onChange={(e) => onProveedor(e.target.value)} className={inputCls}>
              <option value="">Seleccioná…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Bodega de ingreso</label>
            <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={inputCls}>
              <option value="">Seleccioná…</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} — {b.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-neutral-700">Clave / N.º factura</label>
          <input
            type="text"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Clave del comprobante (opcional)"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Fecha emisión</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700">Condición</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value)} className={inputCls}>
              <option value="">—</option>
              <option value="01">Contado</option>
              <option value="02">Crédito</option>
            </select>
          </div>
          <div className="w-20">
            <label className="block text-sm font-medium text-neutral-700">Plazo</label>
            <input
              type="number"
              min="0"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Artículo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 font-medium">IVA</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">IVA ₡</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <select
                    value={l.articulo_id}
                    onChange={(e) => setLinea(i, "articulo_id", e.target.value)}
                    className="w-full min-w-[190px] rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-900"
                  >
                    <option value="">Elegí…</option>
                    {articulos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.cantidad}
                    onChange={(e) => setLinea(i, "cantidad", e.target.value)}
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.costo_unitario}
                    onChange={(e) => setLinea(i, "costo_unitario", e.target.value)}
                    className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={l.iva_tarifa_id}
                    onChange={(e) => setLinea(i, "iva_tarifa_id", e.target.value)}
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-900"
                  >
                    {tarifas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.porcentaje}%
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(calc[i].base)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                  {money(calc[i].iva)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setLineas((p) => p.filter((_, j) => j !== i))}
                    disabled={lineas.length <= 1}
                    className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
                    title="Quitar línea"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr>
              <td className="px-3 py-2" colSpan={4}>
                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, lineaVacia(ivaDefault)])}
                  className="text-neutral-700 hover:text-neutral-900"
                >
                  + Agregar línea
                </button>
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{money(subtotal)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{money(ivaTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>IVA</span>
            <span className="tabular-nums">{money(ivaTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
        </div>
      </div>

      <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
        Se guarda como borrador. Al confirmar, la mercadería entra al inventario y
        se postea Debe Inventario + IVA / Haber CxP, creando la cuenta por pagar.
      </p>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !listo}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link href="/compras/facturas" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
