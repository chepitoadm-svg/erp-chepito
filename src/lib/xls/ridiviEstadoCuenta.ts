// Lector del estado de cuenta de RIDIVI (.xlsx). Mismo formato de salida que el
// del BAC (EstadoCuentaBAC) para reusar el resto del flujo de conciliación.
// Débitos = sale del banco; Créditos = entra. El saldo inicial se deriva del
// primer saldo menos su movimiento (RIDIVI no trae una línea de saldo inicial).
//
// OJO: el archivo mezcla DOS formatos de fecha en la misma columna "Fecha Mov.":
//   - "2/7/26"      → día/mes/año  (barras, año de 2 dígitos)
//   - "07-13-2026"  → mes-día-año  (guiones, año de 4 dígitos)
// Ambos se manejan abajo.
import "server-only";
import * as XLSX from "xlsx";
import type { EstadoCuentaBAC, LineaEstadoCuenta } from "@/lib/xls/bacEstadoCuenta";

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// "1000" / "3164.25" / "-" (vacío) → número. Punto decimal, coma de miles.
function money(s: unknown): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s;
  const t = String(s).replace(/[^\d.,-]/g, "");
  if (t === "" || t === "-") return 0;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Maneja los dos formatos de fecha de RIDIVI → YYYY-MM-DD.
function fechaISO(s: unknown): string | null {
  const str = String(s ?? "").trim();
  let m: RegExpMatchArray | null;
  // MM-DD-YYYY (guiones, año 4 dígitos) → mes primero.
  if ((m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // D/M/YY o D/M/YYYY (barras) → día primero.
  if ((m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// Fila de encabezado de RIDIVI (débitos/créditos/saldo + la columna "Ref SINPE").
function ubicarEncabezado(grid: string[][]) {
  for (let i = 0; i < grid.length; i++) {
    const cells = grid[i].map(norm);
    const deb = cells.findIndex((c) => c.startsWith("debito"));
    const cre = cells.findIndex((c) => c.startsWith("credito"));
    const sal = cells.findIndex((c) => c.startsWith("saldo"));
    const ref = cells.findIndex((c) => c.includes("sinpe"));
    if (deb >= 0 && cre >= 0 && sal >= 0 && ref >= 0) {
      return {
        hIdx: i,
        col: {
          fecha: cells.findIndex((c) => c.startsWith("fecha")),
          movimiento: cells.findIndex((c) => c.startsWith("movimiento")),
          descripcion: cells.findIndex((c) => c.startsWith("descrip")),
          debito: deb,
          credito: cre,
          saldo: sal,
          ref,
        },
      };
    }
  }
  return null;
}

// ¿Es un estado de cuenta de RIDIVI? (para rutear entre lectores de .xlsx).
export function esEstadoCuentaRidivi(buffer: Uint8Array): boolean {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    return ubicarEncabezado(grid) !== null;
  } catch {
    return false;
  }
}

export function parseEstadoCuentaRidivi(buffer: Uint8Array): EstadoCuentaBAC {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });

  const enc = ubicarEncabezado(grid);
  if (!enc) throw new Error("No se reconoció el formato del estado de cuenta de RIDIVI.");
  const { hIdx, col } = enc;

  const lineas: LineaEstadoCuenta[] = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const iso = fechaISO(r[col.fecha]);
    if (!iso) continue; // filas sin fecha (pie, vacías) se ignoran
    const refSinpe = String(r[col.ref] ?? "").replace(/^\*/, "").trim();
    const mov = String(r[col.movimiento] ?? "").trim();
    lineas.push({
      fecha: iso,
      // Si no hay referencia SINPE útil, usar el # de movimiento del banco.
      referencia: !refSinpe || /sin referencia/i.test(refSinpe) ? mov : refSinpe,
      codigo: mov,
      descripcion: String(r[col.descripcion] ?? "").trim(),
      debito: money(r[col.debito]),
      credito: money(r[col.credito]),
      balance: money(r[col.saldo]),
    });
  }
  if (!lineas.length) throw new Error("El estado de cuenta de RIDIVI no trae movimientos.");

  // RIDIVI no trae línea de saldo inicial: se deriva del primer saldo.
  const primera = lineas[0];
  const saldo_inicial = Math.round((primera.balance! - (primera.credito - primera.debito)) * 100) / 100;
  const saldo_final = lineas[lineas.length - 1].balance ?? 0;
  return { saldo_inicial, saldo_final, lineas };
}
