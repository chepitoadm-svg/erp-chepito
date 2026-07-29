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
  base_imponible: number;
  iva_codigo_tarifa: string | null; // CodigoTarifaIVA (ej. 08)
  iva_tarifa: number; // ej. 13
  iva_monto: number; // Monto del impuesto código 07 (IVA acreditable)
  otros_impuestos: string[]; // otros códigos de impuesto en la línea (ej. ['05'])
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

  const lineas: ComprobanteLinea[] = asArray(d.DetalleServicio?.LineaDetalle).map((l) => {
    const impuestos = asArray<Record<string, unknown>>(l.Impuesto);
    const iva07 = impuestos.find((x) => txt(x.Codigo) === "07");
    return {
      numero: num(l.NumeroLinea),
      codigo_comercial: l.CodigoComercial?.Codigo ? txt(l.CodigoComercial.Codigo) : null,
      cabys: l.CodigoCABYS ? txt(l.CodigoCABYS) : null,
      detalle: txt(l.Detalle),
      cantidad: num(l.Cantidad),
      unidad_comercial: l.UnidadMedidaComercial ? txt(l.UnidadMedidaComercial) : null,
      precio_unitario: num(l.PrecioUnitario),
      base_imponible: num(l.BaseImponible),
      iva_codigo_tarifa: iva07?.CodigoTarifaIVA ? txt(iva07.CodigoTarifaIVA) : null,
      iva_tarifa: iva07 ? num(iva07.Tarifa) : 0,
      iva_monto: iva07 ? num(iva07.Monto) : 0,
      otros_impuestos: impuestos.map((x) => txt(x.Codigo)).filter((c) => c && c !== "07"),
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
