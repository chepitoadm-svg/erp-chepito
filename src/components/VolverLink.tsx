"use client";

import { useRouter } from "next/navigation";

// Botón "volver" que regresa a la página anterior con el historial del navegador,
// conservando los filtros de la URL y la posición de scroll. Si no hay historial
// (se llegó directo por enlace), cae al `fallback`.
export default function VolverLink({
  fallback,
  children,
  className = "text-sm text-neutral-500 hover:text-neutral-900",
}: {
  fallback: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
