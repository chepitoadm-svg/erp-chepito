// Fuentes de correo para el JALADOR (server-to-server, token compartido).
//   GET  -> lista de remitentes ACTIVOS con su 'desde' (qué jalar).
//   POST -> marca 'ultimo_jalado' de un remitente (body {remitente}).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  const token = req.headers.get("x-ingesta-token");
  return !!process.env.INGESTA_TOKEN && token === process.env.INGESTA_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("correo_fuentes")
    .select("remitente, etiqueta, desde, ultimo_jalado")
    .eq("activo", true)
    .order("etiqueta");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fuentes: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let body: { remitente?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!body.remitente) return NextResponse.json({ error: "Falta remitente." }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("correo_fuentes")
    .update({ ultimo_jalado: new Date().toISOString() })
    .eq("remitente", body.remitente.toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
