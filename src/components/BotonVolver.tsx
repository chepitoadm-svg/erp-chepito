"use client";

import { useRouter } from "next/navigation";

// Botón "Volver" que regresa a la pantalla anterior (router.back). Si no hay
// historial (ej. se abrió en una pestaña nueva), va al fallback.
export default function BotonVolver({ fallback = "/", label = "Volver" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-sm text-neutral-500 hover:text-neutral-900"
    >
      ← {label}
    </button>
  );
}
