// Lector del estado de cuenta de RIDIVI (.xlsx). Mismo formato de salida que el
// del BAC (EstadoCuentaBAC) para reusar el resto del flujo de conciliación.
// Débitos = sale del banco; Créditos = entra. El saldo inicial se deriva del
// primer saldo menos su movimiento (RIDIVI no trae una línea de saldo inicial).
//
// OJO: el archivo mezcla formatos de fecha en la misma columna "Fecha Mov.":
//   - "2/7/26"      → día/mes/año  (barras, año de 2 dígitos)
//   - "07-13-2026"  → mes-día-año  (guiones) en unos export…
//   - "30-09-2026"  → día-mes-año  (guiones) en otros export
// Como los guiones vienen en AMBOS órdenes según el export, se desambigua por
// validez (un número > 12 solo puede ser el día) y por la convención del archivo.
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

// Maneja los formatos de fecha de RIDIVI → YYYY-MM-DD. Desambigua por validez (un
// componente > 12 solo puede ser el día) y, cuando ambos son ≤ 12, por la
// convención detectada del archivo (dashDayFirst para los guiones).
function fechaISO(s: unknown, dashDayFirst: boolean): string | null {
  const str = String(s ?? "").trim();
  let m: RegExpMatchArray | null;
  // Guiones, año de 4 dígitos (viene como "07-13-2026" = MM-DD o "30-09-2026" = DD-MM).
  if ((m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) {
    const [, p1, p2, y] = m;
    const n1 = Number(p1);
    const n2 = Number(p2);
    let mo: string;
    let d: string;
    if (n1 > 12 && n2 <= 12) {
      d = p1; // el primero es el día → DD-MM
      mo = p2;
    } else if (n2 > 12 && n1 <= 12) {
      mo = p1; // el segundo es el día → MM-DD
      d = p2;
    } else if (dashDayFirst) {
      d = p1;
      mo = p2;
    } else {
      mo = p1;
      d = p2;
    }
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Barras, ej. "2/7/26": RIDIVI usa día/mes; se desambigua igual por validez.
  if ((m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    const [, p1, p2, yRaw] = m;
    const y = yRaw.length === 2 ? "20" + yRaw : yRaw;
    const n1 = Number(p1);
    const n2 = Number(p2);
    let d: string;
    let mo: string;
    if (n2 > 12 && n1 <= 12) {
      mo = p1; // el segundo es el día → M/D
      d = p2;
    } else {
      d = p1; // día/mes (documentado), o día > 12 en la primera posición
      mo = p2;
    }
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// Detecta la convención de las fechas con guiones del archivo: true = DD-MM (día
// primero), false = MM-DD. Mira si algún día > 12 delata la posición; si todas son
// ambiguas, cae en MM-DD (la convención histórica de RIDIVI).
function detectarDashDayFirst(grid: string[][], hIdx: number, colFecha: number): boolean {
  for (let i = hIdx + 1; i < grid.length; i++) {
    const str = String(grid[i]?.[colFecha] ?? "").trim();
    const m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m) continue;
    const n1 = Number(m[1]);
    const n2 = Number(m[2]);
    if (n1 > 12 && n2 <= 12) return true;
    if (n2 > 12 && n1 <= 12) return false;
  }
  return false;
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
  const dashDayFirst = detectarDashDayFirst(grid, hIdx, col.fecha);

  const lineas: LineaEstadoCuenta[] = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const iso = fechaISO(r[col.fecha], dashDayFirst);
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
