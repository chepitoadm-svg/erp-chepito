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

// Dispara el workflow "Jalar facturas del correo" en GitHub Actions, para jalar
// on-demand sin esperar los 15 min. Necesita GITHUB_DISPATCH_TOKEN (PAT con
// permiso Actions: read/write sobre el repo) en las env vars del ERP.
export async function lanzarJalado(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requerirPermiso("compras.facturar");
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { error: "Falta configurar GITHUB_DISPATCH_TOKEN en el servidor (Netlify)." };
  }
  try {
    const res = await fetch(
      "https://api.github.com/repos/chepitoadm-svg/erp-chepito/actions/workflows/jalar-correo.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (res.status === 204) {
      return { ok: "Lanzado. En ~1 minuto las facturas nuevas aparecen en el ingestor." };
    }
    const txt = await res.text();
    return { error: `GitHub respondió ${res.status}. ${limpiar(txt).slice(0, 160)}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo lanzar el jalado." };
  }
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
