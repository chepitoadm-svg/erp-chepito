// Lector del Excel de ventas exportado por QuPOS. Descomprime el xlsx (fflate),
// lee sharedStrings + la primera hoja (fast-xml-parser) y agrega las líneas por
// día para armar la venta del día (gravado / exento / IVA).
//
// Columnas esperadas del export de QuPOS (se ubican por nombre de encabezado,
// tolerante a acentos y a reordenamiento):
//   Artículo · Desc. artículo · Cantidad · Precio final con IVA ·
//   Monto descuento · Impuesto total · Total + IVA · # Documento ·
//   Fecha documento · Preventa de ruta
import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export interface DiaVentaQupos {
  fecha: string; // YYYY-MM-DD
  gravado: number; // neto de las líneas con IVA
  exento: number; // total de las líneas sin IVA
  iva: number;
  total: number; // gravado + exento + iva (lo que entra a caja)
  tickets: number;
  lineas: number;
  sin_descripcion: number; // líneas sin nombre de producto (para avisar sobre el costo)
}

export interface ResumenVentasQupos {
  dias: DiaVentaQupos[];
  total_lineas: number;
  // Filas con monto pero SIN fecha (QuPOS agrega una fila de total/resumen al
  // final sin fecha ni documento). Se ignoran para no duplicar la venta; se
  // reportan para que el usuario lo valide.
  ignoradas_sin_fecha: number;
  ignorado_total: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "row" || name === "c" || name === "si" || name === "r",
});

function textoDe(t: unknown): string {
  if (t == null) return "";
  if (typeof t === "object") return String((t as Record<string, unknown>)["#text"] ?? "");
  return String(t);
}

function parseSharedStrings(xml: string): string[] {
  const doc = parser.parse(xml) as { sst?: { si?: unknown[] } };
  const sis = doc.sst?.si;
  if (!Array.isArray(sis)) return [];
  return sis.map((si) => {
    const s = si as { t?: unknown; r?: { t?: unknown }[] };
    if (s.t !== undefined) return textoDe(s.t);
    if (Array.isArray(s.r)) return s.r.map((rr) => textoDe(rr.t)).join("");
    return "";
  });
}

// "A1" / "AB12" -> índice de columna 0-based.
function colIndex(ref: string): number {
  const m = ref.match(/^[A-Z]+/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Serial de Excel (base 1899-12-30) -> fecha calendario local YYYY-MM-DD.
// Se toma la parte entera (el día); la hora no cambia el día en las ventas.
function serialAFecha(serial: number): string {
  const dias = Math.floor(serial);
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function primeraHoja(archivos: Record<string, Uint8Array>): Uint8Array | null {
  const clave = Object.keys(archivos)
    .filter((k) => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(k))
    .sort()[0];
  return clave ? archivos[clave] : null;
}

// Convierte la hoja en una matriz de strings (fila x columna).
function leerFilas(xml: string, shared: string[]): string[][] {
  const doc = parser.parse(xml) as {
    worksheet?: { sheetData?: { row?: Array<{ c?: Array<Record<string, unknown>> }> } };
  };
  const rows = doc.worksheet?.sheetData?.row ?? [];
  const filas: string[][] = [];
  for (const row of rows) {
    const arr: string[] = [];
    for (const c of row.c ?? []) {
      const ref = String(c["@_r"] ?? "");
      const idx = colIndex(ref);
      const t = c["@_t"];
      let val = "";
      if (t === "s") {
        val = shared[parseInt(textoDe(c.v), 10)] ?? "";
      } else if (t === "inlineStr") {
        val = textoDe((c.is as { t?: unknown } | undefined)?.t);
      } else if (c.v !== undefined) {
        val = textoDe(c.v);
      }
      arr[idx] = val;
    }
    filas.push(arr);
  }
  return filas;
}

const num = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function resumenVentasQupos(buffer: Uint8Array): ResumenVentasQupos {
  const archivos = unzipSync(buffer);
  const ssBuf = archivos["xl/sharedStrings.xml"];
  const shared = ssBuf ? parseSharedStrings(strFromU8(ssBuf)) : [];
  const hoja = primeraHoja(archivos);
  if (!hoja) throw new Error("El archivo no tiene hojas.");
  const filas = leerFilas(strFromU8(hoja), shared);

  // Ubicar la fila de encabezado (la que trae "articulo"/"total").
  let hIdx = -1;
  for (let i = 0; i < Math.min(filas.length, 8); i++) {
    const cols = filas[i].map(normalizar);
    if (cols.some((c) => c === "articulo") && cols.some((c) => c.includes("total"))) {
      hIdx = i;
      break;
    }
  }
  if (hIdx < 0) throw new Error("No se encontró el encabezado esperado de QuPOS.");
  const enc = filas[hIdx].map(normalizar);
  const buscar = (pred: (c: string) => boolean) => enc.findIndex(pred);

  const cDesc = buscar((c) => c.includes("desc"));
  const cIva = buscar((c) => c.includes("impuesto"));
  const cTotal = buscar((c) => c === "total + iva" || (c.includes("total") && c.includes("iva")));
  const cDoc = buscar((c) => c.includes("documento"));
  const cFecha = buscar((c) => c.includes("fecha"));
  if (cIva < 0 || cTotal < 0 || cFecha < 0) {
    throw new Error("Faltan columnas de QuPOS (Impuesto total / Total + IVA / Fecha documento).");
  }

  interface Acc {
    gravadoC: number;
    exentoC: number;
    ivaC: number;
    totalC: number;
    tickets: Set<string>;
    lineas: number;
    sinDesc: number;
  }
  const porDia = new Map<string, Acc>();
  let totalLineas = 0;
  let ignoradasSinFecha = 0;
  let ignoradoTotalC = 0;

  for (let i = hIdx + 1; i < filas.length; i++) {
    const f = filas[i];
    const fechaRaw = f[cFecha];
    const totalRaw = f[cTotal];
    if (!totalRaw) continue; // fila vacía
    if (!fechaRaw) {
      // fila con monto pero sin fecha = total/resumen que agrega QuPOS al final
      ignoradasSinFecha++;
      ignoradoTotalC += Math.round(num(totalRaw) * 100);
      continue;
    }
    const fecha = serialAFecha(num(fechaRaw));
    const totalC = Math.round(num(totalRaw) * 100);
    const ivaC = Math.round(num(f[cIva]) * 100);
    if (totalC === 0) continue;
    totalLineas++;

    let acc = porDia.get(fecha);
    if (!acc) {
      acc = { gravadoC: 0, exentoC: 0, ivaC: 0, totalC: 0, tickets: new Set(), lineas: 0, sinDesc: 0 };
      porDia.set(fecha, acc);
    }
    acc.totalC += totalC;
    acc.ivaC += ivaC;
    if (ivaC > 0) acc.gravadoC += totalC - ivaC;
    else acc.exentoC += totalC;
    acc.lineas++;
    if (cDoc >= 0 && f[cDoc]) acc.tickets.add(f[cDoc]);
    if (cDesc >= 0 && !(f[cDesc] ?? "").trim()) acc.sinDesc++;
  }

  const dias: DiaVentaQupos[] = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, a]) => ({
      fecha,
      gravado: a.gravadoC / 100,
      exento: a.exentoC / 100,
      iva: a.ivaC / 100,
      total: a.totalC / 100,
      tickets: a.tickets.size,
      lineas: a.lineas,
      sin_descripcion: a.sinDesc,
    }));

  return {
    dias,
    total_lineas: totalLineas,
    ignoradas_sin_fecha: ignoradasSinFecha,
    ignorado_total: ignoradoTotalC / 100,
  };
}
