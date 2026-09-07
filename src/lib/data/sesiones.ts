// Lecturas de la bitácora de tiempo de trabajo (sesiones por actividad real).
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface SesionBloque {
  id: string;
  usuario_id: string;
  usuario_nombre: string | null;
  dia: string; // ISO date (para ordenar/agrupar)
  dia_txt: string; // DD/MM/AAAA
  hora_inicio: string; // HH:MM (CR)
  hora_fin: string; // HH:MM (CR)
  duracion_min: number;
  activa: boolean;
  inicio: string;
}

export interface SesionFiltro {
  usuario?: string;
  desde?: string;
  hasta?: string;
}

export async function listarSesiones(f: SesionFiltro = {}): Promise<SesionBloque[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_reporte_sesiones", {
    p_usuario: f.usuario ?? null,
    p_desde: f.desde ?? null,
    p_hasta: f.hasta ?? null,
    p_limit: 500,
  });
  if (error) throw new Error(`No se pudo cargar el tiempo de sesión: ${error.message}`);
  return (data ?? []).map((r: SesionBloque) => ({ ...r, duracion_min: Number(r.duracion_min) }));
}

export async function usuariosConSesiones(): Promise<{ usuario_id: string; nombre_completo: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_sesiones_usuarios");
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`);
  return (data ?? []) as { usuario_id: string; nombre_completo: string }[];
}
