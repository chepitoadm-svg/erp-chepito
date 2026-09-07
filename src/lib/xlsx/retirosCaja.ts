// Lector del Excel de "retiros de caja" que exporta QuPOS. Columnas esperadas:
// Fecha creación | Control caja | Monto colones | Motivo | Denominación | Tipo |
// Cód. cajero | Caja.  Solo se toman las filas de Tipo = "Retiro".
import * as XLSX from "xlsx";

export interface RetiroFila {
  fecha: string; // YYYY-MM-DD
  control_caja: string;
  monto: number;
  motivo: string;
  cajero: string;
  caja: string;
}

// "8/4/26 9:23" (M/D/YY) -> "2026-08-04".
function parseFecha(raw: string): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  let anio = Number(m[3]);
  if (anio < 100) anio += 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function parseMonto(raw: string): number {
  const s = String(raw ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function leerRetiros(buffer: Buffer): { filas: RetiroFila[]; error?: string } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { filas: [], error: "No se pudo leer el archivo (¿es un Excel válido?)." };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { filas: [], error: "El archivo no tiene hojas." };
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });

  // Ubicar la fila de encabezados.
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = norm(rows[i].join("|"));
    if (joined.includes("control caja") && joined.includes("monto")) {
      hIdx = i;
      break;
    }
  }
  if (hIdx < 0) return { filas: [], error: "No encontré los encabezados (Control caja, Monto…)." };

  const head = rows[hIdx].map((h) => norm(String(h)));
  const col = (nombre: string) => head.findIndex((h) => h.includes(nombre));
  const iFecha = col("fecha");
  const iControl = col("control caja");
  const iMonto = col("monto");
  const iMotivo = col("motivo");
  const iTipo = col("tipo");
  const iCajero = col("cajero");
  // "Caja" exacta (no "Control caja"): preferí la coincidencia exacta.
  const iCaja = head.indexOf("caja");

  const filas: RetiroFila[] = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const tipo = iTipo >= 0 ? norm(String(r[iTipo] ?? "")) : "retiro";
    if (tipo && tipo !== "retiro") continue; // solo retiros
    const fecha = parseFecha(String(r[iFecha] ?? ""));
    const monto = parseMonto(String(r[iMonto] ?? ""));
    if (!fecha || !Number.isFinite(monto) || monto === 0) continue; // fila vacía/total
    filas.push({
      fecha,
      control_caja: String(r[iControl] ?? "").trim(),
      monto,
      motivo: String(r[iMotivo] ?? "").replace(/\s+/g, " ").trim(),
      cajero: String(r[iCajero] ?? "").trim(),
      caja: iCaja >= 0 ? String(r[iCaja] ?? "").trim() : "",
    });
  }
  return { filas };
}
