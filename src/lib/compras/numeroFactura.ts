// El "número de factura" que le interesa al usuario es el CONSECUTIVO del
// comprobante (NumeroConsecutivo), no la clave de 50 dígitos. En Costa Rica el
// consecutivo (20 dígitos) va EMBEBIDO dentro de la clave:
//   país(3) + fecha(6) + cédula emisor(12) + CONSECUTIVO(20) + situación(1) + seguridad(8) = 50
// Así que lo extraemos de la clave (posiciones 21..40). Sirve para facturas
// viejas y nuevas por igual.

/** Consecutivo (20 dígitos) extraído de la clave de 50 dígitos. */
export function consecutivoDeClave(clave: string | null | undefined): string | null {
  if (!clave) return null;
  const d = String(clave).replace(/\D/g, "");
  if (d.length !== 50) return null;
  return d.slice(21, 41);
}

/**
 * Texto a mostrar como "número de factura": el consecutivo si se puede derivar
 * de la clave; si no (clave no estándar o nula), la clave tal cual, o null.
 * Si viene un consecutivo ya guardado, ese manda.
 */
export function numeroFactura(
  clave: string | null | undefined,
  consecutivo?: string | null,
): string | null {
  if (consecutivo && String(consecutivo).trim()) return String(consecutivo).trim();
  return consecutivoDeClave(clave) ?? (clave ? String(clave) : null);
}
