"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { FormState } from "@/app/(app)/asientos/actions";

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string; // activo | pasivo | patrimonio | ingreso | gasto | orden
}
interface Centro {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}
interface Linea {
  cuenta_id: string;
  centro_costo_id: string;
  debito: string;
  credito: string;
  detalle: string;
}

interface Props {
  modo: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cuentas: Cuenta[];
  centros: Centro[];
  inicial?: {
    id?: string;
    tipo?: string;
    fecha?: string;
    glosa?: string;
    lineas?: Linea[];
  };
}

const lineaVacia = (): Linea => ({
  cuenta_id: "",
  centro_costo_id: "",
  debito: "",
  credito: "",
  detalle: "",
});

const hoy = () => new Date().toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const estadoInicial: FormState = {};

export default function AsientoForm({ modo, action, cuentas, centros, inicial }: Props) {
  const [state, formAction, pending] = useActionState(action, estadoInicial);
  const [tipo, setTipo] = useState(inicial?.tipo ?? "diario");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  const [glosa, setGlosa] = useState(inicial?.glosa ?? "");
  const [lineas, setLineas] = useState<Linea[]>(
    inicial?.lineas && inicial.lineas.length ? inicial.lineas : [lineaVacia(), lineaVacia()],
  );
  const [confirmar, setConfirmar] = useState(false);

  // Qué cuentas exigen centro de costo (resultado). Se resalta en la UI.
  const cuentaEsResultado = useMemo(() => {
    const m = new Map<string, boolean>();
    cuentas.forEach((c) => m.set(c.id, c.tipo === "ingreso" || c.tipo === "gasto"));
    return m;
  }, [cuentas]);

  const totalDebito = lineas.reduce((s, l) => s + (parseFloat(l.debito) || 0), 0);
  const totalCredito = lineas.reduce((s, l) => s + (parseFloat(l.credito) || 0), 0);
  const diferencia = Math.round((totalDebito - totalCredito) * 100) / 100;
  const cuadra = Math.abs(diferencia) < 0.005 && totalDebito > 0;

  function setLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => {
      const next = [...prev];
      const l = { ...next[i], [campo]: valor };
      // Débito y crédito son excluyentes: al escribir en uno, se limpia el otro.
      if (campo === "debito" && valor) l.credito = "";
      if (campo === "credito" && valor) l.debito = "";
      // Si la cuenta no es de resultado, se limpia el centro.
      if (campo === "cuenta_id" && !cuentaEsResultado.get(valor)) l.centro_costo_id = "";
      next[i] = l;
      return next;
    });
  }

  const lineasJSON = JSON.stringify(
    lineas
      .filter((l) => l.cuenta_id && (parseFloat(l.debito) > 0 || parseFloat(l.credito) > 0))
      .map((l) => ({
        cuenta_id: l.cuenta_id,
        centro_costo_id: l.centro_costo_id || null,
        debito: parseFloat(l.debito) || 0,
        credito: parseFloat(l.credito) || 0,
        detalle: l.detalle || null,
      })),
  );

  return (
    <form action={formAction} className="space-y-6">
      {modo === "editar" && <input type="hidden" name="id" value={inicial?.id} />}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="glosa" value={glosa} />
      <input type="hidden" name="lineas" value={lineasJSON} />
      <input type="hidden" name="confirmar" value={String(confirmar)} />

      {/* Cabecera */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="diario">Diario</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
            <option value="apertura">Apertura</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-neutral-700">Glosa</label>
          <input
            type="text"
            value={glosa}
            onChange={(e) => setGlosa(e.target.value)}
            placeholder="Descripción del asiento"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      {/* Líneas */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Centro</th>
              <th className="px-3 py-2 text-right font-medium">Débito</th>
              <th className="px-3 py-2 text-right font-medium">Crédito</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lineas.map((l, i) => {
              const necesitaCentro = cuentaEsResultado.get(l.cuenta_id);
              return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <select
                      value={l.cuenta_id}
                      onChange={(e) => setLinea(i, "cuenta_id", e.target.value)}
                      className="w-full min-w-[220px] rounded-md border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-900"
                    >
                      <option value="">Elegí una cuenta…</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} — {c.nombre}
                        </option>
                      ))}
                    </select>
                    {l.detalle !== undefined && (
                      <input
                        type="text"
                        value={l.detalle}
                        onChange={(e) => setLinea(i, "detalle", e.target.value)}
                        placeholder="Detalle (opcional)"
                        className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.centro_costo_id}
                      onChange={(e) => setLinea(i, "centro_costo_id", e.target.value)}
                      disabled={!necesitaCentro}
                      className={`w-full min-w-[130px] rounded-md border px-2 py-1.5 outline-none focus:border-neutral-900 ${
                        necesitaCentro
                          ? l.centro_costo_id
                            ? "border-neutral-300"
                            : "border-amber-400 bg-amber-50"
                          : "border-neutral-200 bg-neutral-50 text-neutral-400"
                      }`}
                    >
                      <option value="">{necesitaCentro ? "Requerido…" : "—"}</option>
                      {centros.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.codigo} — {cc.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.debito}
                      onChange={(e) => setLinea(i, "debito", e.target.value)}
                      className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.credito}
                      onChange={(e) => setLinea(i, "credito", e.target.value)}
                      className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-right outline-none focus:border-neutral-900"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setLineas((p) => p.filter((_, j) => j !== i))}
                      disabled={lineas.length <= 2}
                      className="text-neutral-400 hover:text-red-600 disabled:opacity-30"
                      title="Quitar línea"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr className="font-medium">
              <td className="px-3 py-2 text-neutral-500" colSpan={2}>
                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, lineaVacia()])}
                  className="text-neutral-700 hover:text-neutral-900"
                >
                  + Agregar línea
                </button>
              </td>
              <td className="px-3 py-2 text-right">{money(totalDebito)}</td>
              <td className="px-3 py-2 text-right">{money(totalCredito)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Estado del cuadre */}
      <div
        className={`rounded-md px-4 py-2 text-sm ${
          cuadra
            ? "bg-green-50 text-green-700"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        {cuadra
          ? "✓ El asiento cuadra."
          : `Diferencia: ${money(diferencia)} — un borrador puede guardarse así, pero para confirmar debe cuadrar.`}
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          name="confirmar_btn"
          onClick={() => setConfirmar(false)}
          disabled={pending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
        <button
          type="submit"
          onClick={() => setConfirmar(true)}
          disabled={pending || !cuadra}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          title={!cuadra ? "El asiento debe cuadrar para confirmar" : undefined}
        >
          Guardar y confirmar
        </button>
        <Link href="/asientos" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
