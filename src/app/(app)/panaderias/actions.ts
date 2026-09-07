"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";

export async function guardarDato(payload: {
  id: string | null;
  centro: string;
  etiqueta: string;
  valor: string;
  nota: string;
}): Promise<{ error?: string; ok?: boolean }> {
  await requerirPermiso("gastos.registrar");
  if (!payload.centro) return { error: "Elegí la panadería." };
  if (!payload.etiqueta.trim()) return { error: "Poné una etiqueta (ej. NIS agua)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_panaderia_dato", {
    p_id: payload.id,
    p_centro: payload.centro,
    p_etiqueta: payload.etiqueta,
    p_valor: payload.valor || null,
    p_nota: payload.nota || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/panaderias");
  return { ok: true };
}

export async function borrarDato(id: string): Promise<{ error?: string; ok?: boolean }> {
  await requerirPermiso("gastos.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_borrar_panaderia_dato", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/panaderias");
  return { ok: true };
}
