// Lector del PDF "Detalle de retiros - Reporte mensual" de la app de depósitos.
// Cada línea trae: fecha, panadería ("Panadería 1 / Panadería 2"), descripción y
// monto ("− ₡ 112 000"). Se usa pdf-parse (server-side). Import directo del
// archivo interno para evitar el bloque de debug del index.js de pdf-parse.
import "server-only";

export interface RetiroDepFila {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  panaderia: string;
  monto: number;
}

// DD/MM/YYYY + "Panadería N / Panadería M" + descripción + "− ₡ 112 000".
const RE =
  /^(\d{2})\/(\d{2})\/(\d{4})(Panader[íi]a\s*\d+\s*\/\s*Panader[íi]a\s*\d+)(.+?)[−–-]\s*[₡\s]*([\d\s.,]+)$/;

function parseMonto(raw: string): number {
  // Miles con espacio o punto; sin decimales en este reporte.
  const s = raw.replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function leerRetirosDepositos(
  buffer: Buffer,
): Promise<{ filas: RetiroDepFila[]; total: number; error?: string }> {
  let texto: string;
  try {
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdf = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
    const data = await pdf(buffer);
    texto = data.text;
  } catch {
    return { filas: [], total: 0, error: "No se pudo leer el PDF." };
  }

  const filas: RetiroDepFila[] = [];
  for (const linea of texto.split("\n")) {
    const m = linea.match(RE);
    if (!m) continue;
    const monto = parseMonto(m[6]);
    if (!Number.isFinite(monto) || monto === 0) continue;
    filas.push({
      fecha: `${m[3]}-${m[2]}-${m[1]}`,
      panaderia: m[4].replace(/\s+/g, " ").trim(),
      descripcion: m[5].replace(/\s+/g, " ").trim(),
      monto,
    });
  }
  const total = filas.reduce((s, f) => s + f.monto, 0);
  return { filas, total };
}
