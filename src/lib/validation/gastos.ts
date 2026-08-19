// Esquemas Zod para los gastos. Fuente única cliente/servidor.
import { z } from "zod";

export const crearGastoSchema = z.object({
  centro_costo_id: z.string().uuid("Seleccioná el centro de costo."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  cuenta_gasto_id: z.string().uuid("Seleccioná la cuenta de gasto."),
  cuenta_pago_id: z.string().uuid("Seleccioná de dónde sale o contra qué queda."),
  subtotal: z.number().positive("El monto debe ser mayor que cero."),
  iva: z.number().min(0, "El IVA no puede ser negativo."),
  descripcion: z.string().trim().max(300).nullable().optional(),
});

export type CrearGastoInput = z.infer<typeof crearGastoSchema>;
