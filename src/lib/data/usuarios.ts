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

export interface Permiso {
  id: string;
  modulo: string;
  accion: string;
  codigo: string;
  descripcion: string | null;
}

export interface RolListado {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  estado: "activo" | "inactivo";
  n_permisos: number;
  n_usuarios: number;
}

/** Catálogo completo de permisos (para armar los checkboxes por módulo). */
export async function listarPermisos(): Promise<Permiso[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_permisos");
  if (error) throw new Error(`No se pudieron cargar los permisos: ${error.message}`);
  return (data ?? []) as Permiso[];
}

/** Perfiles de acceso (roles) con conteo de permisos y usuarios. */
export async function listarRolesDetalle(): Promise<RolListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_roles");
  if (error) throw new Error(`No se pudieron cargar los perfiles: ${error.message}`);
  return (data ?? []).map((r: RolListado) => ({
    ...r,
    n_permisos: Number(r.n_permisos),
    n_usuarios: Number(r.n_usuarios),
  })) as RolListado[];
}

/** IDs de permisos asignados a un rol. */
export async function permisosDeRol(rolId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_permisos_rol", { p_rol: rolId });
  if (error) throw new Error(`No se pudieron cargar los permisos del perfil: ${error.message}`);
  return (data ?? []).map((r: { permiso_id: string }) => r.permiso_id);
}

/** Overrides (conceder/revocar) de un usuario. */
export async function permisosDeUsuario(
  usuarioId: string,
): Promise<{ conceder: string[]; revocar: string[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_permisos_usuario", { p_usuario: usuarioId });
  if (error) throw new Error(`No se pudieron cargar los permisos del usuario: ${error.message}`);
  const rows = (data ?? []) as { permiso_id: string; efecto: "conceder" | "revocar" }[];
  return {
    conceder: rows.filter((r) => r.efecto === "conceder").map((r) => r.permiso_id),
    revocar: rows.filter((r) => r.efecto === "revocar").map((r) => r.permiso_id),
  };
}

/** Un rol por id (o null). */
export async function obtenerRol(id: string): Promise<RolListado | null> {
  const roles = await listarRolesDetalle();
  return roles.find((r) => r.id === id) ?? null;
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
