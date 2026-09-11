"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";

// Fija (o quita) la clasificación fijo/variable de una cuenta para el análisis
// de punto de equilibrio. tipo='default' borra el override y vuelve al default
// de la sección. No toca contabilidad: es un overlay de análisis.
export async function fijarClasificacion(formData: FormData): Promise<void> {
  await requerirPermiso("reportes.financieros.ver");
  const cuentaId = String(formData.get("cuenta_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  if (!cuentaId) return;
  const supabase = await createClient();
  if (tipo === "default") {
    await supabase.from("clasificacion_costo").delete().eq("cuenta_id", cuentaId);
  } else if (tipo === "fijo" || tipo === "variable") {
    await supabase.from("clasificacion_costo").upsert({ cuenta_id: cuentaId, tipo }, { onConflict: "cuenta_id" });
  }
  revalidatePath("/analisis/finanzas", "layout");
}
