"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { fuenteCorreoSchema } from "@/lib/validation/correo";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

export async function crearFuenteCorreo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("compras.facturar");
  const parsed = fuenteCorreoSchema.safeParse({
    remitente: String(formData.get("remitente") ?? ""),
    etiqueta: String(formData.get("etiqueta") ?? ""),
    desde: String(formData.get("desde") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("correo_fuentes").insert({
    remitente: parsed.data.remitente,
    etiqueta: parsed.data.etiqueta,
    desde: parsed.data.desde,
  });
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ese remitente ya está en la lista."
        : limpiar(error.message),
    };
  }
  revalidatePath("/compras/correo");
  return { ok: "Remitente agregado." };
}

export async function toggleFuenteCorreo(formData: FormData): Promise<void> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "true";
  const supabase = await createClient();
  await supabase.from("correo_fuentes").update({ activo: !activo }).eq("id", id);
  revalidatePath("/compras/correo");
}

export async function editarDesdeFuente(formData: FormData): Promise<void> {
  await requerirPermiso("compras.facturar");
  const id = String(formData.get("id") ?? "");
  const desde = String(formData.get("desde") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return;
  const supabase = await createClient();
  await supabase.from("correo_fuentes").update({ desde }).eq("id", id);
  revalidatePath("/compras/correo");
}
