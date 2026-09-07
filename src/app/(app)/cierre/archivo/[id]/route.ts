import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tienePermiso } from "@/lib/auth/permisos";

// Descarga un archivo del cierre: valida permiso, resuelve el path (RLS) y
// devuelve una URL firmada temporal del bucket privado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso("cierre.gestionar"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("app_archivo_path", { p_archivo: id });
  if (error || !path) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const admin = createAdminClient();
  const { data: signed, error: sErr } = await admin.storage
    .from("cierre")
    .createSignedUrl(path as string, 60);
  if (sErr || !signed) return NextResponse.json({ error: "No se pudo generar el enlace" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
