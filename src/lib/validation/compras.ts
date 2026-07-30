// Esquemas Zod para proveedores y su mapeo de artículos.
import { z } from "zod";

// Cédula jurídica CR: 10 dígitos (3-101-XXXXXX). Se guarda solo dígitos.
const cedula = z
  .string()
  .trim()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length >= 9 && s.length <= 12, "Cédula jurídica inválida.");

const base = {
  cedula_juridica: cedula,
  nombre: z.string().trim().min(2, "El nombre es obligatorio.").max(200),
  condicion_venta_default: z.enum(["01", "02"]).nullable().optional(),
  plazo_credito_default: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional(),
  cuenta_cxp_id: z.string().uuid().nullable().optional(),
};

export const crearProveedorSchema = z.object(base);
export const editarProveedorSchema = z.object({ id: z.string().uuid(), ...base });

export const agregarMapeoSchema = z.object({
  proveedor_id: z.string().uuid(),
  codigo_comercial: z.string().trim().min(1, "El código comercial es obligatorio.").max(80),
  articulo_id: z.string().uuid("Seleccioná el artículo."),
  unidad_compra_id: z.string().uuid("Seleccioná la unidad de compra."),
  factor_a_stock: z.number().positive("El factor debe ser mayor que cero."),
  descripcion_proveedor: z.string().trim().max(300).nullable().optional(),
});

export type CrearProveedorInput = z.infer<typeof crearProveedorSchema>;
export type EditarProveedorInput = z.infer<typeof editarProveedorSchema>;

// === Factura de compra (D1: 1 paso) ========================================
export const facturaLineaSchema = z.object({
  articulo_id: z.string().uuid(),
  codigo_comercial: z.string().trim().max(80).nullable().optional(),
  cantidad: z.number().positive(),
  costo_unitario: z.number().min(0),
  iva_tarifa_id: z.string().uuid(),
  detalle: z.string().trim().max(300).nullable().optional(),
});

export const crearFacturaSchema = z.object({
  proveedor_id: z.string().uuid("Seleccioná el proveedor."),
  bodega_id: z.string().uuid("Seleccioná la bodega de ingreso."),
  clave: z.string().trim().max(80).nullable().optional(),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  condicion_venta: z.enum(["01", "02"]).nullable().optional(),
  plazo_credito: z.number().int().min(0).max(365).nullable().optional(),
  lineas: z.array(facturaLineaSchema).min(1, "Agregá al menos una línea."),
});

export type CrearFacturaInput = z.infer<typeof crearFacturaSchema>;

// === Devolución de compra (D3) =============================================
export const devolucionLineaSchema = z.object({
  articulo_id: z.string().uuid(),
  cantidad: z.number().positive(),
  detalle: z.string().trim().max(300).nullable().optional(),
});

export const crearDevolucionSchema = z.object({
  factura_id: z.string().uuid("Seleccioná la factura."),
  bodega_id: z.string().uuid("Seleccioná la bodega."),
  motivo: z.string().trim().min(3, "El motivo es obligatorio."),
  lineas: z.array(devolucionLineaSchema).min(1, "Indicá al menos un artículo a devolver."),
});

export type CrearDevolucionInput = z.infer<typeof crearDevolucionSchema>;

// === Recepción de compra (D2) ==============================================
export const recepcionLineaSchema = z.object({
  articulo_id: z.string().uuid(),
  cantidad: z.number().positive(),
  costo_unitario: z.number().min(0),
  detalle: z.string().trim().max(300).nullable().optional(),
});

export const crearRecepcionSchema = z.object({
  proveedor_id: z.string().uuid("Seleccioná el proveedor."),
  bodega_id: z.string().uuid("Seleccioná la bodega de ingreso."),
  glosa: z.string().trim().max(200).nullable().optional(),
  lineas: z.array(recepcionLineaSchema).min(1, "Agregá al menos una línea."),
});

export type CrearRecepcionInput = z.infer<typeof crearRecepcionSchema>;

// === Pago a proveedor ======================================================
export const pagoLineaSchema = z.object({
  cxp_id: z.string().uuid(),
  monto: z.number().positive(),
});

export const crearPagoSchema = z.object({
  proveedor_id: z.string().uuid("Seleccioná el proveedor."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  medio_pago: z.enum(["efectivo", "transferencia", "cheque", "otro"]),
  cuenta_pago_id: z.string().uuid("Seleccioná la cuenta de origen."),
  referencia: z.string().trim().max(80).nullable().optional(),
  glosa: z.string().trim().max(200).nullable().optional(),
  lineas: z.array(pagoLineaSchema).min(1, "Marcá al menos una factura a pagar."),
});

export type CrearPagoInput = z.infer<typeof crearPagoSchema>;
