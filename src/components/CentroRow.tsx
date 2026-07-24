"use client";

import { useActionState, useState } from "react";
import { editarCentro, alternarCentroActivo, type FormState } from "@/app/(app)/admin/actions";

interface Centro {
  id: string;
  codigo: string;
  nombre: string;
  tipo: "final" | "intermedio";
  activo: boolean;
  requiere_prorrateo: boolean;
}

const inicial: FormState = {};

export default function CentroRow({ c }: { c: Centro }) {
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<string>(c.tipo);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const res = await editarCentro(prev, fd);
      if (res.ok) setEditando(false); // cierra el editor al guardar bien
      return res;
    },
    inicial,
  );

  if (!editando) {
    return (
      <tr className={c.activo ? "" : "opacity-50"}>
        <td className="px-4 py-3 font-medium text-neutral-900">{c.codigo}</td>
        <td className="px-4 py-3 text-neutral-700">{c.nombre}</td>
        <td className="px-4 py-3 capitalize text-neutral-600">{c.tipo}</td>
        <td className="px-4 py-3 text-neutral-600">
          {c.tipo === "intermedio" ? (c.requiere_prorrateo ? "Sí" : "No") : "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              c.activo ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {c.activo ? "Activo" : "Inactivo"}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-xs text-neutral-600 hover:text-neutral-900"
            >
              Editar
            </button>
            <form action={alternarCentroActivo} className="inline">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="activo" value={String(c.activo)} />
              <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-900">
                {c.activo ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-neutral-50">
      <td className="px-4 py-3" colSpan={6}>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={c.id} />
          <div>
            <label className="block text-xs text-neutral-500">Código</label>
            <input
              name="codigo"
              defaultValue={c.codigo}
              maxLength={8}
              className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm uppercase outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">Nombre</label>
            <input
              name="nombre"
              defaultValue={c.nombre}
              className="w-48 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">Tipo</label>
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
            >
              <option value="final">Final (canal)</option>
              <option value="intermedio">Intermedio (pool)</option>
            </select>
          </div>
          {tipo === "intermedio" && (
            <label className="flex items-center gap-2 pb-1.5 text-sm text-neutral-600">
              <input
                type="checkbox"
                name="requiere_prorrateo"
                defaultChecked={c.requiere_prorrateo}
                className="h-4 w-4"
              />
              Se prorratea
            </label>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="px-2 py-1.5 text-sm text-neutral-500 hover:text-neutral-900"
          >
            Cancelar
          </button>
          {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}
