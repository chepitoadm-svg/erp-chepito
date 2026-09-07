// Lector del Excel de ventas externas: matriz con la fecha en la col 0 y un
// cliente por columna (encabezado en la fila 0). Cada celda = venta de ese
// cliente ese día. Se toma el DÍA de la fecha y se combina con el mes/año
// elegido (el Excel a veces trae el año mal tipeado).
import * as XLSX from "xlsx";

export interface VentaExtFila {
  cliente: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
}

function parseMonto(raw: string): number {
  const s = String(raw ?? "").replace(/[₡\s]/g, "").replace(/,/g, "");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// "01.07.2026" | "1/7/2026" -> día (1..31), o null.
function parseDia(raw: string): number | null {
  const m = String(raw ?? "").trim().match(/^(\d{1,2})[./-]\d{1,2}[./-]\d{2,4}/);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? d : null;
}

export function leerVentasExternas(
  buffer: Buffer,
  anio: number,
  mes: number,
): { filas: VentaExtFila[]; clientes: string[]; error?: string } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { filas: [], clientes: [], error: "No se pudo leer el archivo." };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { filas: [], clientes: [], error: "El archivo no tiene hojas." };
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  if (rows.length < 2) return { filas: [], clientes: [], error: "El archivo está vacío." };

  // Encabezado: col 0 = "Fecha", cols 1..N = nombres de cliente.
  const head = rows[0].map((h) => String(h ?? "").trim());
  const clientesCols: { col: number; nombre: string }[] = [];
  for (let c = 1; c < head.length; c++) {
    const nombre = head[c].trim();
    if (nombre) clientesCols.push({ col: c, nombre });
  }
  if (clientesCols.length === 0) return { filas: [], clientes: [], error: "No encontré columnas de clientes." };

  const mm = String(mes).padStart(2, "0");
  const filas: VentaExtFila[] = [];
  for (let r = 1; r < rows.length; r++) {
    const dia = parseDia(String(rows[r][0] ?? ""));
    if (!dia) continue; // filas de totales / notas: no son un día
    const fecha = `${anio}-${mm}-${String(dia).padStart(2, "0")}`;
    for (const { col, nombre } of clientesCols) {
      const monto = parseMonto(String(rows[r][col] ?? ""));
      if (monto > 0) filas.push({ cliente: nombre, fecha, monto });
    }
  }
  return { filas, clientes: clientesCols.map((c) => c.nombre) };
}
