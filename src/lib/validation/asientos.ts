// Esquemas Zod para asientos. Una sola fuente de verdad para cliente y servidor.
// OJO: la validación dura (cuadre, doble partida, centro obligatorio, periodo
// abierto, inmutabilidad) vive en la BASE. Acá solo se valida la forma del
// formulario para dar feedback temprano; la base es la que manda.
import { z } from "zod";

const TIPOS_MANUALES = ["diario", "ingreso", "egreso", "apertura"] as const;

// Una línea: exactamente uno de débito/crédito > 0. El centro de costo se valida
// en la base (obligatorio solo en cuentas de resultado), acá es opcional.
export const lineaSchema = z
  .object({
    cuenta_id: z.string().uuid("Elegí una cuenta."),
    centro_costo_id: z.string().uuid().nullable().optional(),
    debito: z.coerce.number().min(0, "No puede ser negativo.").default(0),
    credito: z.coerce.number().min(0, "No puede ser negativo.").default(0),
    detalle: z.string().trim().max(300).optional(),
  })
  .refine(
    (l) => (l.debito > 0) !== (l.credito > 0),
    "Cada línea lleva monto en débito O en crédito, no ambos ni ninguno.",
  );

export const asientoSchema = z
  .object({
    id: z.string().uuid().optional(),
    tipo: z.enum(TIPOS_MANUALES, {
      errorMap: () => ({ message: "Tipo de asiento inválido." }),
    }),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
    glosa: z.string().trim().min(3, "La glosa es obligatoria."),
    lineas: z.array(lineaSchema).min(2, "Un asiento necesita al menos 2 líneas."),
    confirmar: z.boolean().default(false),
  })
  .refine((a) => {
    // Si se va a confirmar, el asiento debe cuadrar ya en el formulario. Un
    // borrador puede guardarse descuadrado.
    if (!a.confirmar) return true;
    const d = a.lineas.reduce((s, l) => s + (l.debito || 0), 0);
    const c = a.lineas.reduce((s, l) => s + (l.credito || 0), 0);
    return Math.abs(d - c) < 0.005;
  }, "Para confirmar, los débitos y créditos deben cuadrar.");

export const anularSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(3, "Indicá el motivo de la anulación."),
});

export type AsientoInput = z.infer<typeof asientoSchema>;
