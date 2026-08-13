// Endpoint server-to-server para el JALADOR DE CORREO. Recibe los XML de un
// correo de proveedor y los ingesta con el mismo pipeline del ingestor manual
// (parse + validación + mapeo + guardar en borrador). Se autentica con un token
// compartido (header x-ingesta-token = env INGESTA_TOKEN); NO usa sesión de
// usuario, así que corre con service_role. Deja el comprobante en borrador para
// que el usuario revise/mapee/confirme (Paso 1). NUNCA postea solo por ahora.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestarComprobante } from "@/lib/compras/ingesta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const claveDe = (xml: string) => xml.match(/<Clave>\s*(\d{40,60})\s*<\/Clave>/)?.[1] ?? null;
const esRespuesta = (xml: string) => /<MensajeHacienda[\s>]/.test(xml);
const esComprobante = (xml: string) =>
  /<(FacturaElectronica|TiqueteElectronico|NotaCreditoElectronica|NotaDebitoElectronica)[\s>]/.test(xml);

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ingesta-token");
  if (!process.env.INGESTA_TOKEN || token !== process.env.INGESTA_TOKEN) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { xmls?: string[]; comprobante?: string; respuesta?: string; remitente?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const xmls = (body.xmls ?? [body.comprobante, body.respuesta].filter(Boolean)) as string[];
  const comprobantes = xmls.filter(esComprobante);
  const respuestas = xmls.filter(esRespuesta);
  if (comprobantes.length === 0) {
    return NextResponse.json({ error: "No se encontró un comprobante en los XML enviados." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Si el correo viene de un remitente con emisor fijado, solo se acepta ese emisor.
  let cedulaPermitida: string | null = null;
  if (body.remitente) {
    const { data: fuente } = await supabase
      .from("correo_fuentes")
      .select("cedula_emisor")
      .eq("remitente", body.remitente.toLowerCase())
      .maybeSingle();
    cedulaPermitida = fuente?.cedula_emisor ?? null;
  }

  const resultados = [];
  for (const comp of comprobantes) {
    const clave = claveDe(comp);
    const resp =
      respuestas.find((r) => claveDe(r) === clave) ?? (respuestas.length === 1 ? respuestas[0] : null);
    const res = await ingestarComprobante(supabase, comp, resp ?? null, cedulaPermitida);
    resultados.push(res.ok ? { ok: true, id: res.id, estado: res.estado } : { ok: false, error: res.error, code: res.code });
  }

  return NextResponse.json({ resultados });
}
