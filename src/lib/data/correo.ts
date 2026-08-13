// Capa de datos de las FUENTES DE CORREO (remitentes a jalar por el ingestor
// automático). Corre en el servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface FuenteCorreo {
  id: string;
  remitente: string;
  etiqueta: string;
  activo: boolean;
  desde: string;
  cedula_emisor: string | null;
  ultimo_jalado: string | null;
}

export async function listarFuentesCorreo(): Promise<FuenteCorreo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("correo_fuentes")
    .select("id, remitente, etiqueta, activo, desde, cedula_emisor, ultimo_jalado")
    .order("etiqueta");
  if (error) throw new Error(`No se pudieron cargar las fuentes de correo: ${error.message}`);
  return (data ?? []) as FuenteCorreo[];
}
