"use client";

import { useState, useTransition } from "react";
import { restablecerPassword } from "@/app/(app)/usuarios/actions";

export default function RestablecerPasswordBtn({ usuarioId }: { usuarioId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <h2 className="text-sm font-medium text-neutral-800">Contraseña</h2>
      <p className="mt-1 text-xs text-neutral-500">
        La contraseña actual no se puede ver (se guarda encriptada). Podés asignar una nueva y
        entregársela al usuario.
      </p>

      {!abierto ? (
        <button
          type="button"
          onClick={() => {
            setMsg({});
            setAbierto(true);
          }}
          className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Restablecer contraseña
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Nueva contraseña (mín. 8)"
            className="w-56 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            disabled={pending || clave.length < 8}
            onClick={() =>
              start(async () => {
                const r = await restablecerPassword(usuarioId, clave);
                setMsg(r);
                if (r.ok) {
                  setAbierto(false);
                  setClave("");
                }
              })
            }
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar contraseña"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              setClave("");
            }}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            Cancelar
          </button>
        </div>
      )}

      {msg.error && <p className="mt-2 text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="mt-2 text-sm text-green-700">{msg.ok}</p>}
    </div>
  );
}
