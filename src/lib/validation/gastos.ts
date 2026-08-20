// Esquemas Zod para los gastos. Fuente única cliente/servidor.
import { z } from "zod";

export const crearGastoSchema = z
  .object({
    centro_costo_id: z.string().uuid("Seleccioná el centro de costo."),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
    cuenta_gasto_id: z.string().uuid("Seleccioná la cuenta de gasto."),
    // Modo "pagado": cuenta de caja/banco. Modo "por pagar": proveedor + vencimiento.
    cuenta_pago_id: z.string().uuid().nullable().optional(),
    proveedor_id: z.string().uuid().nullable().optional(),
    fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vencimiento inválido.").nullable().optional(),
    subtotal: z.number().positive("El monto debe ser mayor que cero."),
    iva: z.number().min(0, "El IVA no puede ser negativo."),
    descripcion: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => (v.proveedor_id ? !!v.fecha_vencimiento : !!v.cuenta_pago_id), {
    message: "Elegí de dónde sale (caja/banco) o el proveedor y vencimiento (por pagar).",
    path: ["cuenta_pago_id"],
  });

export type CrearGastoInput = z.infer<typeof crearGastoSchema>;
