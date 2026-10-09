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

// === Recetas / productos ===================================================
const lineaRecetaSchema = z.object({
  tipo_ref: z.enum(["articulo", "insumo_manual", "receta"]),
  ref_id: z.string().uuid("Falta elegir el ingrediente en alguna línea."),
  cantidad: z
    .number({ invalid_type_error: "Cantidad inválida en alguna línea." })
    .positive("La cantidad de cada línea debe ser mayor que cero."),
  unidad: z.enum(UNIDADES, { errorMap: () => ({ message: "Unidad inválida en alguna línea." }) }),
});

export const guardarRecetaSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    nombre: z.string().trim().min(2, "El nombre es obligatorio.").max(200),
    es_producto: z.boolean(),
    clasificacion: z.string().trim().max(120).nullable().optional(),
    rinde_cantidad: z.number().positive("El rendimiento debe ser mayor que cero.").nullable().optional(),
    rinde_unidad: z.enum(UNIDADES).nullable().optional(),
    precio_venta: z.number().min(0, "El precio no puede ser negativo.").nullable().optional(),
    lineas: z.array(lineaRecetaSchema),
  })
  .refine(
    (d) => d.es_producto || (d.rinde_cantidad != null && d.rinde_cantidad > 0 && d.rinde_unidad != null),
    { message: "Una receta intermedia necesita rendimiento (cantidad y unidad).", path: ["rinde_cantidad"] },
  );

export type GuardarRecetaInput = z.infer<typeof guardarRecetaSchema>;
