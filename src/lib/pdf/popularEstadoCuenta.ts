// Lector del estado de cuenta del Banco Popular (PDF que se descarga de la banca
// en línea). Devuelve la misma forma que el lector del BAC para reusar todo el
// flujo de conciliación. Monto negativo = débito (sale del banco); positivo =
// crédito (entra). El PDF trae, por transacción: fecha transacción, fecha
// aplicación, número de comprobante, descripción (multilínea) y, pegados,
// "CRC <monto>CRC <saldo>". Al final trae un "Resumen Consolidado" que se usa
// para validar el parseo.
import "server-only";
import pdf from "pdf-parse/lib/pdf-parse.js";
import type { EstadoCuentaBAC, LineaEstadoCuenta } from "@/lib/xls/bacEstadoCuenta";

const MESES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", SET: "09", OCT: "10", NOV: "11", DIC: "12",
};

// "3,316,689.04" / "-100,000.00" → número (coma de miles, punto decimal).
function money(s: string): number {
  const t = String(s ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// "09 JUL 2026" → 2026-07-09.
function fechaISO(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-zÁÉ]{3})\s+(\d{4})/);
  if (!m) return null;
  const mo = MESES[m[2].toUpperCase()];
  return mo ? `${m[3]}-${mo}-${m[1].padStart(2, "0")}` : null;
}

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export async function parseEstadoCuentaPopular(buffer: Uint8Array): Promise<EstadoCuentaBAC> {
  const data = await pdf(Buffer.from(buffer));
  const full = data.text || "";

  // El "Resumen Consolidado" no son transacciones; se separa para validar.
  const idx = full.search(/Resumen\s+Consolidado/i);
  const cuerpo = idx >= 0 ? full.slice(0, idx) : full;
  const resumen = idx >= 0 ? full.slice(idx) : "";

  // Aplanar (el PDF parte las líneas en cualquier lado).
  const flat = cuerpo.replace(/\s+/g, " ");

  // Cada transacción: fecha, fecha, [comprobante+descripción], CRC monto CRC saldo.
  const re = /(\d{1,2}\s+[A-Za-zÁÉ]{3}\s+\d{4})\s*(\d{1,2}\s+[A-Za-zÁÉ]{3}\s+\d{4})(.*?)CRC\s*(-?[\d.,]+)\s*CRC\s*([\d.,]+)/g;
  const compRe = /^(FT[0-9A-Z]+?\/BN\s*K?|TT\d+\/C\d+|\d{6,}-\d{8})/;

  const lineas: LineaEstadoCuenta[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    const iso = fechaISO(m[1]);
    if (!iso) continue;
    const monto = money(m[4]);
    const saldo = money(m[5]);
    const resto = m[3].trim();
    const cmp = resto.match(compRe);
    const referencia = cmp ? cmp[1].replace(/\s+/g, "") : "";
    const descripcion = (cmp ? resto.slice(cmp[0].length) : resto).replace(/\s+/g, " ").trim();
    lineas.push({
      fecha: iso,
      referencia,
      codigo: "",
      descripcion: descripcion || referencia || "Movimiento",
      debito: monto < 0 ? -monto : 0,
      credito: monto > 0 ? monto : 0,
      balance: saldo,
    });
  }
  if (!lineas.length) throw new Error("No se reconoció el formato del estado de cuenta del Banco Popular (PDF).");

  // Saldos: del resumen si están; si no, se calculan.
  const mSi = resumen.match(/Saldo\s+inicial:?\s*CRC\s*(-?[\d.,]+)/i);
  const mSf = resumen.match(/Saldo\s+actual:?\s*CRC\s*(-?[\d.,]+)/i);
  const primera = lineas[0];
  const saldoInicial = mSi
    ? money(mSi[1])
    : round2((primera.balance ?? 0) - (primera.credito - primera.debito));
  const saldoFinal = mSf ? money(mSf[1]) : (lineas[lineas.length - 1].balance ?? 0);

  // Validación contra el resumen: que el conteo calce (evita importar de más/menos).
  const mnc = resumen.match(/N[uú]mero\s+de\s+cr[eé]ditos:?\s*(\d+)/i);
  const mnd = resumen.match(/N[uú]mero\s+de\s+d[eé]bitos:?\s*(\d+)/i);
  if (mnc && mnd) {
    const esperado = Number(mnc[1]) + Number(mnd[1]);
    if (lineas.length !== esperado)
      throw new Error(`El PDF indica ${esperado} movimientos pero se leyeron ${lineas.length}. Revisá el archivo.`);
  }

  return { saldo_inicial: saldoInicial, saldo_final: saldoFinal, lineas };
}
