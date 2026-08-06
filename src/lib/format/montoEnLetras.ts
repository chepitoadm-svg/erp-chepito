// Convierte un monto en colones a letras, estilo factura CR:
//   167155  ->  "CIENTO SESENTA Y SIETE MIL CIENTO CINCUENTA Y CINCO CON 00/100 COLONES"
// Los centavos se muestran como NN/100. Lógica pura, sin dependencias.

const UNIDADES = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISEIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
];

const DECENAS = [
  "",
  "",
  "VEINTI",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];

const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

function centenasEnLetras(n: number): string {
  // n en 0..999
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto <= 20) {
      partes.push(UNIDADES[resto]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d === 2) {
        partes.push(u === 0 ? "VEINTE" : "VEINTI" + UNIDADES[u]);
      } else {
        partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
      }
    }
  }
  return partes.join(" ");
}

function enteroEnLetras(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const cientos = n % 1000;
  const partes: string[] = [];

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLON" : `${centenasEnLetras(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${centenasEnLetras(miles)} MIL`);
  }
  if (cientos > 0) partes.push(centenasEnLetras(cientos));

  return partes.join(" ").trim();
}

export function montoEnLetras(monto: number, moneda = "COLONES"): string {
  const abs = Math.abs(monto);
  const entero = Math.floor(abs + 1e-9);
  const centavos = Math.round((abs - entero) * 100);
  const cc = String(centavos).padStart(2, "0");
  const letras = enteroEnLetras(entero);
  return `${letras} CON ${cc}/100 ${moneda}`;
}
