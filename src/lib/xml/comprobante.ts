// Parser de comprobantes electrónicos de Hacienda CR v4.4.
// Es lógica pura (sin base de datos): recibe el XML y devuelve datos
// estructurados. La validación de negocio (receptor, proveedor, mapeo) y el
// posteo viven en las Server Actions.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true, // quita ds:, xades:, etc.
  parseTagValue: false, // todo string: los montos se convierten a mano (exactos)
  trimValues: true,
});

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}
function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function txt(x: unknown): string {
  return x === undefined || x === null ? "" : String(x);
}

export type TipoComprobante =
  | "FacturaElectronica"
  | "TiqueteElectronico"
  | "NotaCreditoElectronica"
  | "NotaDebitoElectronica";

export interface ComprobanteLinea {
  numero: number;
  codigo_comercial: string | null;
  cabys: string | null;
  detalle: string;
  cantidad: number;
  unidad_comercial: string | null;
  precio_unitario: number;
  // Costo que va a INVENTARIO: mercadería (base − descuento) + impuestos
  // específicos que efectivamente se cobran (IEBL/ISC, vía Otros Cargos).
  base_imponible: number;
  base_mercaderia: number; // solo la mercadería (base − descuento), para referencia
  especifico: number; // impuesto específico cargado al costo en esta línea
  iva_codigo_tarifa: string | null; // CodigoTarifaIVA (ej. 08 = 13%)
  iva_tarifa: number; // ej. 13
  iva_monto: number; // IVA acreditable de la línea (códigos 01/07/08)
  otros_impuestos: string[]; // códigos de impuesto no-IVA presentes (ej. ['05'])
}

export interface Comprobante {
  tipo: TipoComprobante;
  clave: string;
  consecutivo: string | null;
  fecha_emision: string; // YYYY-MM-DD
  emisor_cedula: string;
  emisor_nombre: string;
  receptor_cedula: string;
  receptor_nombre: string;
  condicion_venta: string | null;
  plazo_credito: number | null;
  moneda: string;
  tipo_cambio: number;
  subtotal: number; // base gravable (TotalVentaNeta)
  iva_total: number; // suma de impuestos código 07
  total: number; // TotalComprobante
  // Cruce de control contra el Resumen (para avisar diferencias):
  resumen_total: number;
  lineas: ComprobanteLinea[];
}

export interface RespuestaHacienda {
  clave: string;
  estado: string; // EstadoMensaje: 'Aceptado' | 'Rechazado' | ...
  emisor_cedula: string;
  receptor_cedula: string;
}

const RAICES: TipoComprobante[] = [
  "FacturaElectronica",
  "TiqueteElectronico",
  "NotaCreditoElectronica",
  "NotaDebitoElectronica",
];

// Códigos de impuesto que son IVA acreditable (recuperable). El resto
// (selectivo de consumo, específicos IEBL, combustibles, etc.) NO es
// recuperable y forma parte del COSTO de la mercadería.
const CODIGOS_IVA = new Set(["01", "07", "08"]);

/** Parsea el XML del comprobante (la factura). Lanza si no reconoce la raíz. */
export function parseComprobante(xml: string): Comprobante {
  const root = parser.parse(xml);
  const tipo = RAICES.find((t) => root[t]);
  if (!tipo) {
    throw new Error(
      "El XML no es un comprobante reconocido (FacturaElectronica, Tiquete, Nota de Crédito/Débito).",
    );
  }
  const d = root[tipo];

  const emisorId = d.Emisor?.Identificacion ?? {};
  const receptorId = d.Receptor?.Identificacion ?? {};
  const rf = d.ResumenFactura ?? {};
  const moneda = rf.CodigoTipoMoneda ?? {};

  // Otros Cargos del documento (ej. Impuesto IEBL de bebidas): el emisor los
  // muestra como "asumidos" por línea y los recobra acá. Se reparten al costo.
  const otrosCargos = num(rf.TotalOtrosCargos);

  // Paso 1: por línea, separar IVA (acreditable) de la mercadería.
  const brutas = asArray(d.DetalleServicio?.LineaDetalle).map((l) => {
    const impuestos = asArray<Record<string, unknown>>(l.Impuesto);
    const iva = impuestos.filter((x) => CODIGOS_IVA.has(txt(x.Codigo)));
    const iva_monto = round2(iva.reduce((s, x) => s + num(x.Monto), 0));
    const primerIva = iva[0];
    // Peso del específico de la línea (para repartir Otros Cargos): los
    // impuestos NO-IVA que el emisor asumió y recobra vía Otros Cargos.
    const especifico_bruto = impuestos
      .filter((x) => !CODIGOS_IVA.has(txt(x.Codigo)))
      .reduce((s, x) => s + num(x.Monto), 0);
    // Mercadería (base − descuento) = MontoTotalLinea − IVA de la línea.
    const mercaderia = round2(num(l.MontoTotalLinea) - iva_monto);
    return {
      l,
      impuestos,
      iva_monto,
      primerIva,
      especifico_bruto,
      mercaderia,
    };
  });

  // Paso 2: repartir Otros Cargos entre las líneas (por peso del específico;
  // si no hay específicos, por peso de la mercadería). La última absorbe el
  // residuo para que la suma cuadre al céntimo.
  const pesoEspecifico = round2(brutas.reduce((s, b) => s + b.especifico_bruto, 0));
  const usarEspecifico = pesoEspecifico > 0;
  const pesoTotal = usarEspecifico
    ? pesoEspecifico
    : brutas.reduce((s, b) => s + b.mercaderia, 0);
  let repartido = 0;

  const lineas: ComprobanteLinea[] = brutas.map((b, i) => {
    let extra = 0;
    if (otrosCargos !== 0 && pesoTotal > 0) {
      if (i === brutas.length - 1) extra = round2(otrosCargos - repartido);
      else {
        extra = round2((otrosCargos * (usarEspecifico ? b.especifico_bruto : b.mercaderia)) / pesoTotal);
        repartido = round2(repartido + extra);
      }
    }
    const l = b.l;
    return {
      numero: num(l.NumeroLinea),
      codigo_comercial: l.CodigoComercial?.Codigo ? txt(l.CodigoComercial.Codigo) : null,
      cabys: l.CodigoCABYS ? txt(l.CodigoCABYS) : null,
      detalle: txt(l.Detalle),
      cantidad: num(l.Cantidad),
      unidad_comercial: l.UnidadMedidaComercial ? txt(l.UnidadMedidaComercial) : null,
      precio_unitario: num(l.PrecioUnitario),
      base_mercaderia: b.mercaderia,
      especifico: extra,
      base_imponible: round2(b.mercaderia + extra), // costo a inventario
      iva_codigo_tarifa: b.primerIva?.CodigoTarifaIVA ? txt(b.primerIva.CodigoTarifaIVA) : null,
      iva_tarifa: b.primerIva ? num(b.primerIva.Tarifa) : 0,
      iva_monto: b.iva_monto,
      otros_impuestos: b.impuestos.map((x) => txt(x.Codigo)).filter((c) => c && !CODIGOS_IVA.has(c)),
    };
  });

  const subtotal = round2(lineas.reduce((s, l) => s + l.base_imponible, 0));
  const iva_total = round2(lineas.reduce((s, l) => s + l.iva_monto, 0));
  const total = round2(subtotal + iva_total);
  const plazo = d.PlazoCredito ? parseInt(txt(d.PlazoCredito), 10) : null;

  return {
    tipo,
    clave: txt(d.Clave),
    consecutivo: d.NumeroConsecutivo ? txt(d.NumeroConsecutivo) : null,
    fecha_emision: txt(d.FechaEmision).slice(0, 10),
    emisor_cedula: txt(emisorId.Numero),
    emisor_nombre: txt(d.Emisor?.Nombre),
    receptor_cedula: txt(receptorId.Numero),
    receptor_nombre: txt(d.Receptor?.Nombre),
    condicion_venta: d.CondicionVenta ? txt(d.CondicionVenta) : null,
    plazo_credito: plazo != null && Number.isFinite(plazo) ? plazo : null,
    moneda: moneda.CodigoMoneda ? txt(moneda.CodigoMoneda) : "CRC",
    tipo_cambio: moneda.TipoCambio ? num(moneda.TipoCambio) : 1,
    subtotal,
    iva_total,
    total,
    resumen_total: num(rf.TotalComprobante),
    lineas,
  };
}

/** Parsea el XML de respuesta de Hacienda (MensajeHacienda). */
export function parseRespuesta(xml: string): RespuestaHacienda {
  const root = parser.parse(xml);
  const mh = root.MensajeHacienda;
  if (!mh) throw new Error("El XML de respuesta no es un MensajeHacienda.");
  return {
    clave: txt(mh.Clave),
    estado: txt(mh.EstadoMensaje),
    emisor_cedula: txt(mh.NumeroCedulaEmisor),
    receptor_cedula: txt(mh.NumeroCedulaReceptor),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
