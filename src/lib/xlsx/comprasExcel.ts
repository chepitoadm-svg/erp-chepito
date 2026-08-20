// Lector del Excel de COMPRAS (resumen de facturas, una fila por factura, sin
// detalle de artículos). Cada factura trae la bodega, que mapea a un centro de
// costo. Se importa como compra periódica por centro.
import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export interface CompraExcelFila {
  factura: string;
  fecha: string; // YYYY-MM-DD
  razon_comercial: string;
  bodega: string;
  centro_codigo: "CH1" | "CH2" | "TAL";
  total: number;
  iva: number;
  exento: number;
  gravado: number;
  cancelada: boolean;
}

export interface ResumenComprasExcel {
  filas: CompraExcelFila[];
  ignoradas_sin_centro: { bodega: string; total: number }[]; // bodegas no mapeadas o fila de total
  proveedores: string[]; // razones comerciales distintas
}

// Mapeo "Desc. Bodega" (QuPOS) → código de centro del ERP.
function centroDeBodega(bodega: string): "CH1" | "CH2" | "TAL" | null {
  const b = bodega.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (b.includes("TALLER")) return "TAL";
  if (b === "CHEPITO 1" || b.includes("SUCURSAL 1") || b === "CHEPITO1") return "CH1";
  if (b.includes("CHEPITO 2") || b.includes("SUCURSAL 2") || b === "CHEPITO2") return "CH2";
  return null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (n) => n === "row" || n === "c" || n === "si" || n === "r",
});
const td = (t: unknown): string =>
  t == null ? "" : typeof t === "object" ? String((t as Record<string, unknown>)["#text"] ?? "") : String(t);

function colIndex(ref: string): number {
  const m = ref.match(/^[A-Z]+/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function serialAFecha(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = (s: string | undefined) => {
  if (!s) return 0;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function parseComprasExcel(buffer: Uint8Array): ResumenComprasExcel {
  const archivos = unzipSync(buffer);
  const ssBuf = archivos["xl/sharedStrings.xml"];
  const shared: string[] = ssBuf
    ? (parser.parse(strFromU8(ssBuf)).sst?.si ?? []).map((si: { t?: unknown; r?: { t?: unknown }[] }) =>
        si.t !== undefined ? td(si.t) : (si.r ?? []).map((r) => td(r.t)).join(""),
      )
    : [];
  const hojaKey = Object.keys(archivos)
    .filter((k) => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(k))
    .sort()[0];
  if (!hojaKey) throw new Error("El archivo no tiene hojas.");
  const doc = parser.parse(strFromU8(archivos[hojaKey]));
  const rows = doc.worksheet?.sheetData?.row ?? [];
  const grid: string[][] = rows.map((row: { c?: Array<Record<string, unknown>> }) => {
    const arr: string[] = [];
    for (const c of row.c ?? []) {
      const idx = colIndex(String(c["@_r"] ?? ""));
      const t = c["@_t"];
      let v = "";
      if (t === "s") v = shared[parseInt(td(c.v), 10)] ?? "";
      else if (t === "inlineStr") v = td((c.is as { t?: unknown } | undefined)?.t);
      else if (c.v !== undefined) v = td(c.v);
      arr[idx] = v;
    }
    return arr;
  });

  // Encabezado: ubicar columnas por nombre.
  const enc = (grid[0] ?? []).map(norm);
  const col = (pred: (c: string) => boolean) => enc.findIndex(pred);
  const cFactura = col((c) => c.includes("factura") && !c.includes("doc"));
  const cFecha = col((c) => c === "fecha");
  const cRazon = col((c) => c.includes("razon"));
  const cBodega = col((c) => c.includes("bodega"));
  const cTotal = col((c) => c === "total");
  const cIva = col((c) => c.includes("impuesto"));
  const cExento = col((c) => c.includes("exento"));
  const cGravado = col((c) => c.includes("gravado"));
  const cCancel = col((c) => c.includes("cancelada"));
  if (cFactura < 0 || cFecha < 0 || cBodega < 0 || cTotal < 0) {
    throw new Error("Faltan columnas del Excel de compras (No. factura / Fecha / Desc. Bodega / Total).");
  }

  const filas: CompraExcelFila[] = [];
  const ignoradas: { bodega: string; total: number }[] = [];
  const proveedores = new Set<string>();

  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const totalRaw = r[cTotal];
    const bodega = (r[cBodega] ?? "").trim();
    if (!totalRaw) continue;
    // La fila de TOTAL al final no trae bodega ni fecha.
    if (!bodega || !r[cFecha]) {
      ignoradas.push({ bodega: bodega || "(total)", total: num(totalRaw) });
      continue;
    }
    const centro = centroDeBodega(bodega);
    if (!centro) {
      ignoradas.push({ bodega, total: num(totalRaw) });
      continue;
    }
    const razon = (r[cRazon] ?? "").trim();
    if (razon) proveedores.add(razon);
    filas.push({
      factura: (r[cFactura] ?? "").trim(),
      fecha: serialAFecha(num(r[cFecha])),
      razon_comercial: razon,
      bodega,
      centro_codigo: centro,
      total: Math.round(num(totalRaw) * 100) / 100,
      iva: Math.round(num(r[cIva]) * 100) / 100,
      exento: Math.round(num(r[cExento]) * 100) / 100,
      gravado: Math.round(num(r[cGravado]) * 100) / 100,
      cancelada: norm(r[cCancel] ?? "") === "s",
    });
  }

  return { filas, ignoradas_sin_centro: ignoradas, proveedores: [...proveedores].sort() };
}
