// Helpers de autenticación y autorización del lado servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Devuelve el usuario autenticado o null. */
export async function getUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Igual que getUsuario pero lanza si no hay sesión. */
export async function requerirUsuario() {
  const user = await getUsuario();
  if (!user) throw new Error("No autenticado.");
  return user;
}

/** ¿El usuario actual tiene el permiso indicado? (evaluado en la base, con RLS). */
export async function tienePermiso(codigo: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tengo_permiso", {
    p_codigo: codigo,
  });
  if (error) return false;
  return data === true;
}

/**
 * Exige un permiso. Lanza si el usuario no lo tiene. Usar al inicio de cada
 * Server Action que modifique datos, ANTES de tocar el cliente admin.
 */
export async function requerirPermiso(codigo: string): Promise<void> {
  await requerirUsuario();
  if (!(await tienePermiso(codigo))) {
    throw new Error(`Permiso denegado: se requiere "${codigo}".`);
  }
}
