import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Redirección RELATIVA: en Netlify el host de `req.url` puede ser el permalink del
// deploy (…--erp-chepito.netlify.app), donde no viaja la cookie de sesión y caería
// al login. Un Location relativo se resuelve contra el dominio actual del usuario.
function irA(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

// Abre la conciliación de una cuenta bancaria para un mes dado (desde el checklist
// de cierre). Si existe, va a su detalle; si no, a la lista filtrada por la cuenta.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cuenta = sp.get("cuenta");
  const anio = Number(sp.get("anio"));
  const mes = Number(sp.get("mes"));
  const base = "/tesoreria/conciliaciones";

  if (!cuenta || !Number.isInteger(anio) || !(mes >= 1 && mes <= 12)) return irA(base);

  // Rango del mes [primer día, primer día del mes siguiente) en UTC.
  const ini = new Date(Date.UTC(anio, mes - 1, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data } = await supabase
    .from("conciliaciones_banco")
    .select("id")
    .eq("cuenta_id", cuenta)
    .neq("estado", "anulada")
    .gte("fecha_corte", ini)
    .lt("fecha_corte", fin)
    .order("fecha_corte", { ascending: false })
    .limit(1)
    .maybeSingle();

  return irA(data?.id ? `${base}/${data.id}` : `${base}?cuenta=${cuenta}`);
}
