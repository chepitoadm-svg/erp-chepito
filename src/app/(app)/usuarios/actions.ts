"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPermiso } from "@/lib/auth/permisos";
import { obtenerUsuario } from "@/lib/data/usuarios";
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  cambiarEstadoSchema,
} from "@/lib/validation/usuarios";

export interface FormState {
  error?: string;
}

/** Crea un usuario de Auth + su perfil, le asigna rol y sucursales. */
export async function crearUsuario(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("usuarios.crear");

  const parsed = crearUsuarioSchema.safeParse({
    nombre_completo: formData.get("nombre_completo"),
    email: formData.get("email"),
    password: formData.get("password"),
    rol_id: formData.get("rol_id"),
    sucursales: formData.getAll("sucursales"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }
  const { nombre_completo, email, password, rol_id, sucursales } = parsed.data;

  const admin = createAdminClient();

  // 1. Crear el usuario en Auth (el trigger crea su fila en perfiles).
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo },
  });
  if (authError || !created.user) {
    return {
      error:
        authError?.message === "A user with this email address has already been registered"
          ? "Ya existe un usuario con ese correo."
          : `No se pudo crear el usuario: ${authError?.message ?? "error desconocido"}.`,
    };
  }
  const userId = created.user.id;

  // 2. Completar el perfil (nombre, rol, activo).
  const { error: perfilError } = await admin
    .from("perfiles")
    .update({ nombre_completo, rol_id, estado: "activo" })
    .eq("id", userId);
  if (perfilError) {
    return { error: `Usuario creado pero falló el perfil: ${perfilError.message}` };
  }

  // 3. Asignar sucursales.
  const { error: sucError } = await admin
    .from("usuarios_sucursales")
    .insert(sucursales.map((s) => ({ usuario_id: userId, sucursal_id: s })));
  if (sucError) {
    return { error: `Usuario creado pero fallaron las sucursales: ${sucError.message}` };
  }

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

/** Edita nombre, rol y sucursales de un usuario existente. */
export async function editarUsuario(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("usuarios.editar");

  const parsed = editarUsuarioSchema.safeParse({
    id: formData.get("id"),
    nombre_completo: formData.get("nombre_completo"),
    rol_id: formData.get("rol_id"),
    sucursales: formData.getAll("sucursales"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }
  const { id, nombre_completo, rol_id, sucursales } = parsed.data;

  // El usuario debe ser visible para quien edita (alcance por sucursal).
  const visible = await obtenerUsuario(id);
  if (!visible) return { error: "El usuario no existe o no tenés acceso." };

  const admin = createAdminClient();

  const { error: perfilError } = await admin
    .from("perfiles")
    .update({ nombre_completo, rol_id })
    .eq("id", id);
  if (perfilError) return { error: `No se pudo actualizar: ${perfilError.message}` };

  // Reemplazar el set de sucursales.
  const { error: delError } = await admin
    .from("usuarios_sucursales")
    .delete()
    .eq("usuario_id", id);
  if (delError) return { error: `No se pudieron actualizar las sucursales: ${delError.message}` };

  const { error: insError } = await admin
    .from("usuarios_sucursales")
    .insert(sucursales.map((s) => ({ usuario_id: id, sucursal_id: s })));
  if (insError) return { error: `No se pudieron asignar las sucursales: ${insError.message}` };

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

/** Alterna activo/inactivo desde la lista (form directo, sin useActionState). */
export async function alternarEstado(formData: FormData): Promise<void> {
  await requerirPermiso("usuarios.anular");
  const id = String(formData.get("id") ?? "");
  const actual = String(formData.get("estado_actual") ?? "");
  const nuevo = actual === "activo" ? "inactivo" : "activo";

  const visible = await obtenerUsuario(id);
  if (!visible) throw new Error("El usuario no existe o no tenés acceso.");

  const admin = createAdminClient();
  const { error } = await admin.from("perfiles").update({ estado: nuevo }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

/** Activa o desactiva un usuario. NUNCA borra (regla dura #3). */
export async function cambiarEstadoUsuario(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requerirPermiso("usuarios.anular");

  const parsed = cambiarEstadoSchema.safeParse({
    id: formData.get("id"),
    estado: formData.get("estado"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }
  const { id, estado } = parsed.data;

  const visible = await obtenerUsuario(id);
  if (!visible) return { error: "El usuario no existe o no tenés acceso." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("perfiles")
    .update({ estado })
    .eq("id", id);
  if (error) return { error: `No se pudo cambiar el estado: ${error.message}` };

  revalidatePath("/usuarios");
  return {};
}
