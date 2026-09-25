"use client";

import { useState, useTransition } from "react";
import { crearArticuloRapido, type ArticuloRapido } from "@/app/(app)/inventario/actions";
import SelectBuscable from "@/components/SelectBuscable";

interface Opcion {
  id: string;
  codigo: string;
  nombre: string;
}

interface Props {
  unidades: Opcion[];
  tarifas: { id: string; codigo: string; nombre: string; porcentaje: number }[];
  cuentas?: Opcion[];
  ivaDefault: string;
  onCreado: (articulo: ArticuloRapido) => void;
  onCerrar: () => void;
}

const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

// Mini-formulario para crear un artículo sin salir de la pantalla actual
// (ej. registrando una factura manual). Al crearlo, lo devuelve al padre para
// que lo agregue al selector y lo seleccione.
export default function NuevoArticuloInline({
  unidades,
  tarifas,
  cuentas = [],
  ivaDefault,
  onCreado,
  onCerrar,
}: Props) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("materia_prima");
  const [unidad, setUnidad] = useState("");
  const [iva, setIva] = useState(ivaDefault);
  const [cuenta, setCuenta] = useState("");
  const [inventariable, setInventariable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await crearArticuloRapido({
        codigo,
        nombre,
        tipo,
        unidad_stock_id: unidad,
        iva_tarifa_id: iva,
        cuenta_inventario_id: cuenta || null,
        inventariable,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      onCreado(r.articulo);
    });
  }

  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Nuevo artículo</h3>
        <button
          type="button"
          onClick={onCerrar}
          className="text-neutral-400 hover:text-neutral-700"
          title="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-neutral-600">Código</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={40}
            placeholder="HARINA"
            className={inputCls + " uppercase"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Harina de trigo"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="materia_prima">Materia prima</option>
            <option value="producto_terminado">Producto terminado</option>
            <option value="suministro">Suministro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">Unidad de stock</label>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className={inputCls}>
            <option value="">Seleccioná…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo} — {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">Tarifa de IVA</label>
          <select value={iva} onChange={(e) => setIva(e.target.value)} className={inputCls}>
            {tarifas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        {cuentas.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-neutral-600">Cuenta de inventario</label>
            <SelectBuscable
              value={cuenta}
              onChange={setCuenta}
              placeholder="— Sin cuenta específica —"
              options={cuentas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
              className={inputCls}
            />
          </div>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={inventariable}
          onChange={(e) => setInventariable(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Inventariable (lleva kardex y existencias)
      </label>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pending || !codigo.trim() || nombre.trim().length < 2 || !unidad || !iva}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? "Creando…" : "Crear y usar"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
