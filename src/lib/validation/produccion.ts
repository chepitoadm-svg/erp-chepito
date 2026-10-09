// Esquemas Zod para Producción (Fase 4-1). Fuente única para cliente y servidor.
import { z } from "zod";

// Unidades que entiende la receta (igual que la app vieja y la migración).
export const UNIDADES = ["g", "kg", "ml", "L", "unidad", "porcion"] as const;
export type Unidad = (typeof UNIDADES)[number];

// === Insumos manuales ======================================================
const insumoBase = {
  nombre: z.string().trim().min(2, "El nombre es obligatorio.").max(200),
  costo_compra: z
    .number({ invalid_type_error: "El costo de compra es obligatorio." })
    .min(0, "El costo no puede ser negativo."),
  cantidad_compra: z
    .number({ invalid_type_error: "La cantidad de compra es obligatoria." })
    .positive("La cantidad debe ser mayor que cero."),
  unidad: z.enum(UNIDADES, { errorMap: () => ({ message: "Seleccioná la unidad." }) }),
  proveedor: z.string().trim().max(200).nullable().optional(),
};

export const crearInsumoSchema = z.object(insumoBase);
export const editarInsumoSchema = z.object({ id: z.string().uuid(), ...insumoBase });

export type CrearInsumoInput = z.infer<typeof crearInsumoSchema>;
export type EditarInsumoInput = z.infer<typeof editarInsumoSchema>;
