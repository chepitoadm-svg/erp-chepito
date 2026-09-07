"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";

export interface RolFormState {
  error?: string;
}

function leer(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "").trim(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    descripcion: String(formData.get("descripcion") ?? "").trim(),
    permisos: formData.getAll("permisos").map((p) => String(p)),
  };
}

export async function crearRol(_prev: RolFormState, formData: FormData): Promise<RolFormState> {
  await requerirPermiso("roles.gestionar");
  const { nombre, descripcion, permisos } = leer(formData);
  if (nombre.length < 2) return { error: "El nombre del perfil es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_crear_rol", {
    p_nombre: nombre,
    p_descripcion: descripcion || null,
    p_permisos: permisos,
  });
  if (error) return { error: error.message };
  revalidatePath("/roles");
  redirect("/roles");
}

export async function editarRol(_prev: RolFormState, formData: FormData): Promise<RolFormState> {
  await requerirPermiso("roles.gestionar");
  const { id, nombre, descripcion, permisos } = leer(formData);
  if (!id) return { error: "Falta el perfil." };
  if (nombre.length < 2) return { error: "El nombre del perfil es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_editar_rol", {
    p_rol: id,
    p_nombre: nombre,
    p_descripcion: descripcion || null,
    p_permisos: permisos,
  });
  if (error) return { error: error.message };
  revalidatePath("/roles");
  redirect("/roles");
}

/** Activa / desactiva un perfil (form directo desde la lista). */
export async function alternarEstadoRol(formData: FormData): Promise<void> {
  await requerirPermiso("roles.gestionar");
  const id = String(formData.get("id") ?? "");
  const actual = String(formData.get("estado_actual") ?? "");
  const nuevo = actual === "activo" ? "inactivo" : "activo";
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cambiar_estado_rol", { p_rol: id, p_estado: nuevo });
  if (error) {
    // No romper la pantalla: el motivo (p. ej. usuarios asignados) se relee al refrescar.
    console.error("[roles] alternarEstado:", error.message);
  }
  revalidatePath("/roles");
}
