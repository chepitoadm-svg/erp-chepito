// Capa de datos de PANADERÍAS (datos/servicios de referencia por centro). Servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PanaderiaDato {
  id: string;
  centro_costo_id: string;
  etiqueta: string;
  valor: string | null;
  nota: string | null;
}

export async function listarPanaderiaDatos(): Promise<PanaderiaDato[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("panaderia_dato")
    .select("id, centro_costo_id, etiqueta, valor, nota")
    .order("etiqueta");
  if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`);
  return (data ?? []) as PanaderiaDato[];
}
