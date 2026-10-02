// Lector del estado de cuenta del Banco Popular en CSV (el que exporta la banca
// en línea, separado por ";"). Devuelve la misma forma que el lector del BAC para
// reusar todo el flujo de conciliación. Monto negativo = débito (sale del banco);
// positivo = crédito (entra). Columnas:
//   Fecha Transaccion;Fecha Aplicacion;Numero Comprobante;Descripcion;Creditos/Debitos;Saldo
// Al final trae un "Resumen Consolidado" (Saldo Inicial, Saldo actual, Numero de
// creditos/debitos) que se usa para los saldos y para validar el conteo.
import "server-only";
import type { EstadoCuentaBAC, LineaEstadoCuenta } from "@/lib/xls/bacEstadoCuenta";

const MESES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", SET: "09", OCT: "10", NOV: "11", DIC: "12",
};

// "CRC -75,000.00" / "CRC 594,151.38" → número (coma de miles, punto decimal).
function money(s: string): number {
  const t = String(s ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// "01 SEP 2026" → 2026-09-01.
function fechaISO(s: string): string | null {
  const m = String(s ?? "").match(/(\d{1,2})\s+([A-Za-zÁÉ]{3})\s+(\d{4})/);
  if (!m) return null;
  const mo = MESES[m[2].toUpperCase()];
  return mo ? `${m[3]}-${mo}-${m[1].padStart(2, "0")}` : null;
}

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

// Decodifica el buffer: intenta UTF-8 y, si aparecen caracteres de reemplazo
// (típico de los export en Windows-1252), reintenta con esa codificación.
function decodificar(buffer: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch {
    return utf8;
  }
}

// ¿El contenido parece el CSV del Banco Popular? (para enrutar/validar).
export function esEstadoCuentaPopularCsv(buffer: Uint8Array): boolean {
  const t = decodificar(buffer).slice(0, 2000).toLowerCase();
  return (t.includes("banco popular") || t.includes("fecha transaccion")) && t.includes(";");
}

export function parseEstadoCuentaPopularCsv(buffer: Uint8Array): EstadoCuentaBAC {
  const texto = decodificar(buffer);
  const filas = texto.split(/\r?\n/);

  // Ubicar el encabezado de la tabla y el inicio del "Resumen Consolidado".
  const idxHeader = filas.findIndex((l) => {
    const n = l.toLowerCase();
    return n.includes("fecha transaccion") && n.includes("saldo");
  });
  const idxResumen = filas.findIndex((l) => /resumen\s+consolidado/i.test(l));

  const lineas: LineaEstadoCuenta[] = [];
  const hasta = idxResumen >= 0 ? idxResumen : filas.length;
  const desde = idxHeader >= 0 ? idxHeader + 1 : 0;
  for (let i = desde; i < hasta; i++) {
    const cols = filas[i].split(";").map((c) => c.trim());
    if (cols.length < 6) continue; // fila vacía, metadata o incompleta
    const iso = fechaISO(cols[0]);
    if (!iso) continue; // no es una fila de movimiento
    const saldoStr = cols[cols.length - 1];
    const montoStr = cols[cols.length - 2];
    const comprobante = cols[2] ?? "";
    const descripcion = cols
      .slice(3, cols.length - 2)
      .join("; ")
      .replace(/\s+/g, " ")
      .trim();
    const monto = money(montoStr);
    const saldo = money(saldoStr);
    lineas.push({
      fecha: iso,
      referencia: comprobante,
      codigo: "",
      descripcion: descripcion || comprobante || "Movimiento",
      debito: monto < 0 ? -monto : 0,
      credito: monto > 0 ? monto : 0,
      balance: saldoStr ? saldo : null,
    });
  }
  if (!lineas.length)
    throw new Error("No se reconoció el formato del estado de cuenta del Banco Popular (CSV).");

  // Resumen Consolidado: saldos y conteos para validar.
  const resumen = idxResumen >= 0 ? filas.slice(idxResumen).join("\n") : "";
  const buscar = (re: RegExp): string | null => {
    const m = resumen.match(re);
    return m ? m[1] : null;
  };
  const siStr = buscar(/saldo\s+inicial\s*;?\s*(CRC\s*-?[\d.,]+)/i);
  const sfStr = buscar(/saldo\s+actual\s*;?\s*(CRC\s*-?[\d.,]+)/i);
  const primera = lineas[0];
  const saldoInicial =
    siStr != null ? money(siStr) : round2((primera.balance ?? 0) - (primera.credito - primera.debito));
  const saldoFinal = sfStr != null ? money(sfStr) : lineas[lineas.length - 1].balance ?? 0;

  // Validación de conteo contra el resumen (evita importar de más o de menos).
  const ncStr = buscar(/n[uú]mero\s+de\s+cr[eé]ditos\s*;?\s*(\d+)/i);
  const ndStr = buscar(/n[uú]mero\s+de\s+d[eé]bitos\s*;?\s*(\d+)/i);
  if (ncStr != null && ndStr != null) {
    const esperado = Number(ncStr) + Number(ndStr);
    if (lineas.length !== esperado)
      throw new Error(`El CSV indica ${esperado} movimientos pero se leyeron ${lineas.length}. Revisá el archivo.`);
  }

  return { saldo_inicial: saldoInicial, saldo_final: saldoFinal, lineas };
}
