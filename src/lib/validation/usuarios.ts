// Esquemas Zod para usuarios. Se usan igual en cliente (react-hook-form) y en
// servidor (Server Actions), así la validación es una sola fuente de verdad.
import { z } from "zod";

export const crearUsuarioSchema = z.object({
  nombre_completo: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres."),
  email: z.string().trim().email("Correo inválido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres."),
  rol_id: z.string().uuid("Seleccioná un rol."),
  sucursales: z
    .array(z.string().uuid())
    .min(1, "Asigná al menos una sucursal."),
});

export const editarUsuarioSchema = z.object({
  id: z.string().uuid(),
  nombre_completo: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres."),
  rol_id: z.string().uuid("Seleccioná un rol."),
  sucursales: z
    .array(z.string().uuid())
    .min(1, "Asigná al menos una sucursal."),
});

export const cambiarEstadoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(["activo", "inactivo"]),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;
