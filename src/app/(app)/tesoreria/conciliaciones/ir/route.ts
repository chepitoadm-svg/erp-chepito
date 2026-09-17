import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Resuelve y abre la conciliación de una cuenta bancaria para un mes dado
// (usado desde el checklist de cierre). Si existe, redirige a su detalle; si no,
// a la lista de conciliaciones filtrada por esa cuenta para crearla.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cuenta = sp.get("cuenta");
  const anio = Number(sp.get("anio"));
  const mes = Number(sp.get("mes"));
  const base = "/tesoreria/conciliaciones";

  if (!cuenta || !Number.isInteger(anio) || !(mes >= 1 && mes <= 12)) {
    return NextResponse.redirect(new URL(base, req.url));
  }

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

  if (data?.id) {
    return NextResponse.redirect(new URL(`${base}/${data.id}`, req.url));
  }
  // No hay conciliación de ese mes: llevar a la lista filtrada por la cuenta.
  return NextResponse.redirect(new URL(`${base}?cuenta=${cuenta}`, req.url));
}
