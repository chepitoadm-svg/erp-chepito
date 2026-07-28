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
