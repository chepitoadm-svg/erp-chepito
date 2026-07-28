// Esquemas Zod para el catálogo de artículos. Una sola fuente de verdad para
// cliente y servidor.
import { z } from "zod";

const base = {
  codigo: z.string().trim().min(1, "El código es obligatorio.").max(40),
  nombre: z.string().trim().min(2, "El nombre es obligatorio.").max(200),
  tipo: z.enum(["materia_prima", "producto_terminado", "suministro"]),
  unidad_stock_id: z.string().uuid("Seleccioná la unidad de stock."),
  iva_tarifa_id: z.string().uuid("Seleccioná la tarifa de IVA."),
  cuenta_inventario_id: z.string().uuid().nullable().optional(),
  cabys_codigo: z.string().trim().max(40).nullable().optional(),
  inventariable: z.boolean(),
};

export const crearArticuloSchema = z.object(base);
export const editarArticuloSchema = z.object({ id: z.string().uuid(), ...base });

export type CrearArticuloInput = z.infer<typeof crearArticuloSchema>;
export type EditarArticuloInput = z.infer<typeof editarArticuloSchema>;

// === Carga inicial =========================================================
export const cargaInicialSchema = z.object({
  articulo_id: z.string().uuid("Seleccioná el artículo."),
  bodega_id: z.string().uuid("Seleccioná la bodega."),
  cantidad: z.number().positive("La cantidad debe ser mayor que cero."),
  costo_unitario: z.number().min(0, "El costo no puede ser negativo."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable().optional(),
});

// === Ajustes de inventario =================================================
export const ajusteLineaSchema = z.object({
  articulo_id: z.string().uuid(),
  direccion: z.enum(["pos", "neg"]),
  cantidad: z.number().positive(),
  detalle: z.string().trim().max(300).nullable().optional(),
});

export const crearAjusteSchema = z.object({
  bodega_id: z.string().uuid("Seleccioná la bodega."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  motivo: z.string().trim().min(3, "El motivo es obligatorio."),
  lineas: z.array(ajusteLineaSchema).min(1, "Agregá al menos una línea."),
});

export type CargaInicialInput = z.infer<typeof cargaInicialSchema>;
export type CrearAjusteInput = z.infer<typeof crearAjusteSchema>;
