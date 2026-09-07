"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarRequisito, desactivarRequisito } from "@/app/(app)/cierre/actions";
import type { Requisito } from "@/lib/data/cierre";

interface Centro {
  codigo: string;
  nombre: string;
}

const ALCANCE_LBL: Record<string, string> = {
  global: "Uno por mes",
  centro: "Por centro",
  cuenta_banco: "Por cuenta de banco",
};
const AUTO_LBL: Record<string, string> = {
  ventas: "Ventas",
  compras: "Compras",
  planilla: "Planilla",
  conciliacion: "Conciliación",
};

const vacio = {
  id: "",
  nombre: "",
  grupo: "Otros",
  alcance: "global",
  auto_fuente: "",
  centros: [] as string[],
  requiere_archivo: true,
  orden: 100,
};

export default function RequisitosEditor({
  requisitos,
  centros,
}: {
  requisitos: Requisito[];
  centros: Centro[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<typeof vacio>(vacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const editar = (r: Requisito) => {
    setEditId(r.id);
    setForm({
      id: r.id,
      nombre: r.nombre,
      grupo: r.grupo,
      alcance: r.alcance,
      auto_fuente: r.auto_fuente ?? "",
      centros: r.centros ?? [],
      requiere_archivo: r.requiere_archivo,
      orden: r.orden,
    });
    setMsg({});
  };
  const nuevo = () => {
    setEditId(null);
    setForm(vacio);
    setMsg({});
  };

  const guardar = () =>
    start(async () => {
      setMsg({});
      const fd = new FormData();
      if (form.id) fd.set("id", form.id);
      fd.set("nombre", form.nombre);
      fd.set("grupo", form.grupo);
      fd.set("alcance", form.alcance);
      fd.set("auto_fuente", form.auto_fuente);
      if (form.requiere_archivo) fd.set("requiere_archivo", "on");
      fd.set("orden", String(form.orden));
      if (form.alcance === "centro") form.centros.forEach((c) => fd.append("centros", c));
      const r = await guardarRequisito(fd);
      setMsg(r);
      if (r.ok) {
        nuevo();
        router.refresh();
      }
    });

  const toggleActivo = (r: Requisito) =>
    start(async () => {
      await desactivarRequisito(r.id, !r.activo);
      router.refresh();
    });

  const inputCls = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Lista */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Requisito</th>
              <th className="px-3 py-2 font-medium">Alcance</th>
              <th className="px-3 py-2 font-medium">Auto</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requisitos.map((r) => (
              <tr key={r.id} className={r.activo ? "" : "opacity-50"}>
                <td className="px-3 py-2">
                  <div className="font-medium text-neutral-800">{r.nombre}</div>
                  <div className="text-xs text-neutral-500">{r.grupo}</div>
                </td>
                <td className="px-3 py-2 text-neutral-600">
                  {ALCANCE_LBL[r.alcance]}
                  {r.centros && r.centros.length > 0 && (
                    <span className="text-xs text-neutral-400"> ({r.centros.join(", ")})</span>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-600">{r.auto_fuente ? AUTO_LBL[r.auto_fuente] : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => editar(r)} className="text-neutral-600 hover:text-neutral-900">
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActivo(r)}
                      disabled={pending}
                      className="text-neutral-500 hover:text-neutral-900"
                    >
                      {r.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formulario */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">
            {editId ? "Editar requisito" : "Nuevo requisito"}
          </h2>
          {editId && (
            <button onClick={nuevo} className="text-xs text-neutral-500 hover:text-neutral-900">
              + Nuevo
            </button>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-neutral-500">Nombre</span>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={`${inputCls} mt-1 w-full`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Grupo</span>
              <input
                value={form.grupo}
                onChange={(e) => setForm({ ...form, grupo: e.target.value })}
                className={`${inputCls} mt-1 w-full`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">Orden</span>
              <input
                type="number"
                value={form.orden}
                onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })}
                className={`${inputCls} mt-1 w-full`}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-neutral-500">Alcance</span>
            <select
              value={form.alcance}
              onChange={(e) => setForm({ ...form, alcance: e.target.value })}
              className={`${inputCls} mt-1 w-full`}
            >
              <option value="global">Uno por mes</option>
              <option value="centro">Uno por centro</option>
              <option value="cuenta_banco">Uno por cuenta de banco</option>
            </select>
          </label>

          {form.alcance === "centro" && (
            <div>
              <span className="text-xs text-neutral-500">Centros (vacío = todos los finales)</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {centros.map((c) => {
                  const on = form.centros.includes(c.codigo);
                  return (
                    <button
                      key={c.codigo}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          centros: on ? form.centros.filter((x) => x !== c.codigo) : [...form.centros, c.codigo],
                        })
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        on ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {c.codigo}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs text-neutral-500">Auto-marcado</span>
            <select
              value={form.auto_fuente}
              onChange={(e) => setForm({ ...form, auto_fuente: e.target.value })}
              className={`${inputCls} mt-1 w-full`}
            >
              <option value="">Manual (sin auto)</option>
              <option value="ventas">Ventas cargadas</option>
              <option value="compras">Compras cargadas</option>
              <option value="planilla">Planilla posteada</option>
              <option value="conciliacion">Conciliación</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requiere_archivo}
              onChange={(e) => setForm({ ...form, requiere_archivo: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="text-neutral-700">Se espera subir archivo</span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={guardar}
              disabled={pending || form.nombre.trim().length < 2}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
            {msg.error && <span className="text-xs text-red-600">{msg.error}</span>}
            {msg.ok && <span className="text-xs text-green-700">{msg.ok}</span>}
          </div>
          <p className="text-xs text-neutral-400">
            Los cambios aplican a los meses que abrás de aquí en adelante (o al reabrir/regenerar un mes).
          </p>
        </div>
      </div>
    </div>
  );
}
