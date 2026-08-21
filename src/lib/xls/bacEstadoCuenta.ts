// Lector del estado de cuenta del BAC (archivo .xls binario). Extrae los saldos
// del encabezado y las líneas de movimiento. Débito = sale del banco; Crédito =
// entra. Usa SheetJS para leer el BIFF.
import "server-only";
import * as XLSX from "xlsx";

export interface LineaEstadoCuenta {
  fecha: string; // YYYY-MM-DD
  referencia: string;
  codigo: string;
  descripcion: string;
  debito: number;
  credito: number;
  balance: number | null;
}

export interface EstadoCuentaBAC {
  saldo_inicial: number;
  saldo_final: number;
  lineas: LineaEstadoCuenta[];
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// "14,007.16" / "1.234,56" → número. El BAC usa coma de miles y punto decimal.
function money(s: unknown): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s;
  const t = String(s).replace(/[^\d.,-]/g, "");
  // formato con coma de miles + punto decimal
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// "01/07/2026" o "01/07/2026 22:58:01" → YYYY-MM-DD.
function fechaISO(s: unknown): string | null {
  const m = String(s ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseEstadoCuentaBAC(buffer: Uint8Array): EstadoCuentaBAC {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });

  // Fila de encabezado de la tabla (tiene "fecha", "descripcion" y "debitos"/"creditos").
  let hIdx = -1;
  let col: Record<string, number> = {};
  for (let i = 0; i < grid.length; i++) {
    const cells = grid[i].map(norm);
    const fecha = cells.findIndex((c) => c === "fecha");
    const desc = cells.findIndex((c) => c.startsWith("descrip"));
    const deb = cells.findIndex((c) => c.startsWith("debito"));
    const cre = cells.findIndex((c) => c.startsWith("credito"));
    if (fecha >= 0 && desc >= 0 && deb >= 0 && cre >= 0) {
      hIdx = i;
      col = {
        fecha,
        referencia: cells.findIndex((c) => c.startsWith("referencia")),
        codigo: cells.findIndex((c) => c.startsWith("codigo")),
        descripcion: desc,
        debito: deb,
        credito: cre,
        balance: cells.findIndex((c) => c.startsWith("balance") || c.startsWith("saldo")),
      };
      break;
    }
  }
  if (hIdx < 0) throw new Error("No se reconoció el formato del estado de cuenta del BAC.");

  // Saldo inicial: la línea sin fecha con descripción "saldo inicial", su balance.
  let saldoInicial = 0;
  const lineas: LineaEstadoCuenta[] = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const desc = String(r[col.descripcion] ?? "").trim();
    const iso = fechaISO(r[col.fecha]);
    const bal = col.balance >= 0 ? money(r[col.balance]) : null;
    if (!iso) {
      if (norm(desc).includes("saldo inicial") && bal) saldoInicial = bal;
      continue;
    }
    lineas.push({
      fecha: iso,
      referencia: String(r[col.referencia] ?? "").trim(),
      codigo: String(r[col.codigo] ?? "").trim(),
      descripcion: desc,
      debito: money(r[col.debito]),
      credito: money(r[col.credito]),
      balance: bal,
    });
  }
  if (!lineas.length) throw new Error("El estado de cuenta no trae movimientos.");

  const saldoFinal = lineas[lineas.length - 1].balance ?? 0;
  return { saldo_inicial: saldoInicial, saldo_final: saldoFinal, lineas };
}
