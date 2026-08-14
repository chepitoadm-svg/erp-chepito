// Esquemas Zod para las ventas del día. Fuente única para cliente y servidor.
import { z } from "zod";

export const crearVentaDiaSchema = z
  .object({
    centro_costo_id: z.string().uuid("Seleccioná el negocio (Chepito 1 o 2)."),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
    gravado: z.number().min(0, "No puede ser negativo."),
    exento: z.number().min(0, "No puede ser negativo."),
    iva: z.number().min(0, "No puede ser negativo."),
    glosa: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.gravado + v.exento + v.iva > 0, {
    message: "La venta no tiene monto.",
    path: ["gravado"],
  });

export type CrearVentaDiaInput = z.infer<typeof crearVentaDiaSchema>;

export const anularVentaDiaSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indicá el motivo de la anulación.").max(300),
});
