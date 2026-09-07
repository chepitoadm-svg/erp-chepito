"use client";

import { useEffect, useRef } from "react";
import { latido } from "@/app/(app)/actions";

// Marca actividad cada minuto mientras la pestaña esté visible (no cuenta el
// tiempo con la pestaña en segundo plano). Alimenta la bitácora de sesiones.
const CADA_MS = 60_000;

export default function LatidoSesion() {
  const ultimo = useRef(0);

  useEffect(() => {
    const pulso = () => {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - ultimo.current < CADA_MS - 1000) return; // freno
      ultimo.current = ahora;
      void latido();
    };

    pulso(); // al entrar
    const t = setInterval(pulso, CADA_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") pulso();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
