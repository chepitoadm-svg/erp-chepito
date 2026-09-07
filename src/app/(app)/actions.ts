"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Latido de actividad para la bitácora de tiempo de trabajo. Best-effort:
 *  si falla (sin sesión, red), no rompe nada en la pantalla. */
export async function latido(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("fn_latido_sesion");
  } catch {
    // Silencioso a propósito.
  }
}
