// Lector del TXT de liquidación de datafono (Credomatic/BAC). Toma el bloque de
// RESUMEN del final (totales del mes por concepto), no las líneas diarias.
//   FACTURACION → lo que el procesador facturó (créditos)
//   COMISION + AJUSTE COMISION INTERNACIONAL + IVA SOBRE AJUSTES → comisión (gasto)
//   AJUSTES COBRADOS → servicios (cobro terminal / mantenimiento / asistencia)
//   RETENCION IVA AFILIADOS → IVA retenido
//   RET.IMPUESTA RENTA DE AFILIADOS → renta retenida
//   PAGO EN BANCO ... → neto depositado
import "server-only";

export interface LiquidacionDatafono {
  periodo: string; // YYYY-MM-01 (mes del archivo)
  facturacion: number;
  comision: number; // comisión + ajuste int + IVA ajustes
  servicios: number; // ajustes cobrados
  ret_iva: number;
  ret_renta: number;
  neto_banco: number;
  descuadre: number; // facturacion − (comision+servicios+ret_iva+ret_renta+neto): debe ser ~0
}

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/�/g, "") // el � de latin1 mal leído
    .toLowerCase()
    .trim();
}

const num = (s: string): number => {
  const n = Number((s || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function parseLiquidacionDatafono(texto: string): LiquidacionDatafono {
  const lineas = texto.split(/\r?\n/);
  // Periodo: primer dato con fecha DD/MM/YYYY en las líneas diarias.
  let periodo = "";
  for (const l of lineas) {
    const m = l.match(/\|(\d{2})\/(\d{2})\/(\d{4})\|/);
    if (m) {
      periodo = `${m[3]}-${m[2]}-01`;
      break;
    }
  }

  // El resumen final tiene un encabezado con "Movimiento" (no "Fecha").
  let ini = -1;
  for (let i = 0; i < lineas.length; i++) {
    const n = normaliza(lineas[i]);
    if (n.includes("movimiento") && n.includes("bitos") && !n.includes("fecha")) {
      ini = i;
      break;
    }
  }
  if (ini < 0) throw new Error("No se encontró el resumen del datafono en el archivo (bloque de totales).");

  let facturacion = 0,
    comisionBase = 0,
    ajusteInt = 0,
    ivaAjustes = 0,
    servicios = 0,
    retIva = 0,
    retRenta = 0,
    neto = 0;

  for (let i = ini + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.includes("|")) continue;
    const c = linea.split("|").map((x) => x.trim());
    // c[1]=código c[2]=movimiento c[3]=débitos c[4]=créditos c[5]=pagar
    const nombre = normaliza(c[2] ?? "");
    if (!nombre) continue;
    if (nombre.startsWith("totales")) break;
    const monto = num(c[3]) || num(c[4]) || num(c[5]); // el valor está en la columna que aplique

    if (nombre.includes("facturacion")) facturacion += monto;
    else if (nombre.includes("ajuste comision") || nombre.includes("ajuste comisin")) ajusteInt += monto;
    else if (nombre.includes("iva sobre ajustes")) ivaAjustes += monto;
    else if (nombre === "comision" || nombre === "comisin" || nombre.startsWith("comision ")) comisionBase += monto;
    else if (nombre.includes("ajustes cobrados")) servicios += monto;
    else if (nombre.includes("retencion iva") || nombre.includes("retencin iva")) retIva += monto;
    else if (nombre.includes("renta de afiliados") || nombre.includes("impuesta renta")) retRenta += monto;
    else if (nombre.includes("pago en banco")) neto += monto;
    // "ajustes cobrados" ya cubierto; otros conceptos se ignoran
  }

  const comision = Math.round((comisionBase + ajusteInt + ivaAjustes) * 100) / 100;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const descuadre = r2(facturacion - (comision + servicios + retIva + retRenta + neto));
  if (!periodo) throw new Error("No se pudo determinar el mes del archivo.");
  return {
    periodo,
    facturacion: r2(facturacion),
    comision,
    servicios: r2(servicios),
    ret_iva: r2(retIva),
    ret_renta: r2(retRenta),
    neto_banco: r2(neto),
    descuadre,
  };
}
