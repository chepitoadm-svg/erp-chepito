import { z } from "zod";

export const fuenteCorreoSchema = z.object({
  remitente: z.string().trim().toLowerCase().email("Poné un correo válido del remitente."),
  etiqueta: z.string().trim().min(2, "Poné un nombre (ej. el proveedor).").max(120),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
});

export type FuenteCorreoInput = z.infer<typeof fuenteCorreoSchema>;
