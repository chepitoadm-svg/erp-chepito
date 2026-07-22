// Capa de datos de la entidad USUARIOS (lecturas). Corre en el servidor con el
// cliente sujeto a RLS. Las escrituras viven en las Server Actions
// (app/(app)/usuarios/actions.ts) porque requieren el cliente admin.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UsuarioListado {
  id: string;
  nombre_completo: string;
  email: string;
  estado: "activo" | "inactivo";
  rol_id: string | null;
  rol_codigo: string | null;
  rol_nombre: string | null;
  sucursales: { id: string; codigo: string; nombre: string }[];
}

export interface UsuarioDetalle {
  id: string;
  nombre_completo: string;
  email: string;
  estado: "activo" | "inactivo";
  rol_id: string | null;
  sucursales: string[];
}

/** Usuarios visibles para el usuario actual (respeta alcance por sucursal). */
export async function listarUsuarios(): Promise<UsuarioListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_usuarios");
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`);
  return (data ?? []) as UsuarioListado[];
}

/** Un usuario por id, o null si no existe / no es visible. */
export async function obtenerUsuario(id: string): Promise<UsuarioDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_obtener_usuario", { p_id: id });
  if (error) throw new Error(`No se pudo cargar el usuario: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? (row as UsuarioDetalle) : null;
}

/** Roles activos para poblar el selector. */
export async function listarRoles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, codigo, nombre")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar los roles: ${error.message}`);
  return data ?? [];
}

/** Sucursales visibles para el usuario actual (RLS por sucursal). */
export async function listarSucursales() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sucursales")
    .select("id, codigo, nombre, tipo")
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  return data ?? [];
}
