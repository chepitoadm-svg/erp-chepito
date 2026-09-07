// Capa de datos de la AUDITORÍA (solo lectura). La tabla public.auditoria la
// pueblan los triggers de todas las tablas; acá se consulta con filtros.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditoriaEvento {
  id: number;
  tabla: string;
  registro_id: string;
  accion: "insert" | "update" | "delete";
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  ocurrido_en: string;
}

export interface AuditoriaFiltro {
  usuario?: string;
  tabla?: string;
  accion?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export async function listarAuditoria(f: AuditoriaFiltro = {}): Promise<AuditoriaEvento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_listar_auditoria", {
    p_usuario: f.usuario ?? null,
    p_tabla: f.tabla ?? null,
    p_accion: f.accion ?? null,
    p_desde: f.desde ?? null,
    p_hasta: f.hasta ?? null,
    p_limit: f.limit ?? 200,
    p_offset: f.offset ?? 0,
  });
  if (error) throw new Error(`No se pudo cargar la auditoría: ${error.message}`);
  return (data ?? []) as AuditoriaEvento[];
}

/** Tablas presentes en la auditoría, con conteo (para el filtro de módulo). */
export async function listarTablasAuditoria(): Promise<{ tabla: string; n: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_auditoria_tablas");
  if (error) throw new Error(`No se pudieron cargar los módulos: ${error.message}`);
  return (data ?? []).map((r: { tabla: string; n: number }) => ({ tabla: r.tabla, n: Number(r.n) }));
}

/** Usuarios que aparecen en la auditoría (para el filtro de usuario). */
export async function listarUsuariosAuditoria(): Promise<{ usuario_id: string; nombre_completo: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_auditoria_usuarios");
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`);
  return (data ?? []) as { usuario_id: string; nombre_completo: string }[];
}
