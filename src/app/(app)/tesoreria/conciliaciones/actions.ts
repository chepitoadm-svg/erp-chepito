"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { parseEstadoCuentaBAC } from "@/lib/xls/bacEstadoCuenta";

export interface FormState {
  error?: string;
  ok?: string;
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Empareja automáticamente por monto (banco crédito↔Debe libros, banco débito↔
// Haber) y fecha cercana (±5 días). Greedy: cada movimiento se usa una vez.
async function autoEmparejar(supabase: Awaited<ReturnType<typeof createClient>>, conciliacionId: string, cuenta: string) {
  const { data: lineas } = await supabase
    .from("estado_cuenta_lineas")
    .select("id, fecha, debito, credito")
    .eq("conciliacion_id", conciliacionId)
    .eq("estado", "pendiente");
  const { data: movs } = await supabase
    .from("asientos_lineas")
    .select("id, debito, credito, asiento:asientos!inner(fecha, estado, tipo)")
    .eq("cuenta_id", cuenta)
    .eq("asiento.estado", "confirmado")
    .neq("asiento.tipo", "reversion");
  const { data: yaMatch } = await supabase
    .from("estado_cuenta_lineas")
    .select("asiento_linea_id")
    .not("asiento_linea_id", "is", null);
  const usados = new Set((yaMatch ?? []).map((m: { asiento_linea_id: string }) => m.asiento_linea_id));

  const disponibles = ((movs ?? []) as unknown as {
    id: string;
    debito: number;
    credito: number;
    asiento: { fecha: string };
  }[]).filter((m) => !usados.has(m.id));

  const diasEntre = (a: string, b: string) =>
    Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

  const pendientes = (lineas ?? []) as { id: string; fecha: string; debito: number; credito: number }[];
  const casadas = new Set<string>();

  // Pasada 1: calce EXACTO (banco débito ↔ Haber libros, banco crédito ↔ Debe).
  for (const l of pendientes) {
    const idx = disponibles.findIndex(
      (m) =>
        Math.round(Number(m.credito) * 100) === Math.round(Number(l.debito) * 100) &&
        Math.round(Number(m.debito) * 100) === Math.round(Number(l.credito) * 100) &&
        diasEntre(m.asiento.fecha, l.fecha) <= 5,
    );
    if (idx >= 0) {
      const m = disponibles[idx];
      const { error } = await supabase.rpc("fn_conciliar_linea", { p_linea: l.id, p_asiento_linea: m.id });
      if (!error) {
        disponibles.splice(idx, 1);
        casadas.add(l.id);
      }
    }
  }

  // Pasada 2: diferencias chicas (redondeo). Se acepta hasta AUTO_TOL colones y
  // se elige el movimiento con la MENOR diferencia, para no casar montos que en
  // realidad son distintos. La diferencia se manda a la cuenta de redondeo.
  const AUTO_TOL = 5;
  for (const l of pendientes) {
    if (casadas.has(l.id)) continue;
    let mejor: { id: string; res: number } | null = null;
    for (const m of disponibles) {
      if (diasEntre(m.asiento.fecha, l.fecha) > 5) continue;
      const res = Math.round(((Number(m.credito) - Number(l.debito)) - (Number(m.debito) - Number(l.credito))) * 100) / 100;
      if (res === 0 || Math.abs(res) > AUTO_TOL) continue;
      if (!mejor || Math.abs(res) < Math.abs(mejor.res)) mejor = { id: m.id, res };
    }
    if (mejor) {
      const { error } = await supabase.rpc("fn_conciliar_redondeo", {
        p_linea: l.id,
        p_asiento_linea: mejor.id,
        p_tolerancia: AUTO_TOL,
      });
      if (!error) {
        const i = disponibles.findIndex((m) => m.id === mejor!.id);
        if (i >= 0) disponibles.splice(i, 1);
        casadas.add(l.id);
      }
    }
  }
}

export async function importarEstadoCuenta(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("tesoreria.conciliar");
  const cuenta = String(formData.get("cuenta_id") ?? "");
  const fechaCorte = String(formData.get("fecha_corte") ?? "");
  if (!cuenta) return { error: "Elegí la cuenta bancaria." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) return { error: "Elegí la fecha de corte." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Subí el estado de cuenta (.xls)." };

  let ec;
  try {
    ec = parseEstadoCuentaBAC(new Uint8Array(await archivo.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el estado de cuenta." };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_crear_conciliacion", {
    p_cuenta: cuenta,
    p_fecha_corte: fechaCorte,
    p_saldo_inicial: ec.saldo_inicial,
    p_saldo_final: ec.saldo_final,
    p_lineas: ec.lineas,
  });
  if (error || !id) {
    const msg = error?.message ?? "No se pudo crear la conciliación.";
    return {
      error: msg.includes("conciliaciones_banco_unica")
        ? "Ya hay una conciliación de esa cuenta a esa fecha."
        : limpiar(msg),
    };
  }
  await autoEmparejar(supabase, id, cuenta);
  redirect(`/tesoreria/conciliaciones/${id}`);
}

// Vuelve a correr el emparejado automático sobre lo que quede pendiente.
export async function conciliarAutomatico(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conciliaciones_banco")
    .select("cuenta_id")
    .eq("id", id)
    .single();
  if (c?.cuenta_id) await autoEmparejar(supabase, id, c.cuenta_id);
  revalidatePath(`/tesoreria/conciliaciones/${id}`);
}

export async function conciliarLinea(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const linea = String(formData.get("linea_id") ?? "");
  const mov = String(formData.get("asiento_linea_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliar_linea", { p_linea: linea, p_asiento_linea: mov });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/tesoreria/conciliaciones`);
}

// Empareja UN movimiento de libros con VARIAS líneas del banco (si la suma calza).
export async function conciliarGrupo(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const mov = String(formData.get("asiento_linea_id") ?? "");
  const lineas = String(formData.get("lineas") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!mov || lineas.length === 0) throw new Error("Elegí un movimiento de libros y al menos una línea del banco.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliar_grupo", { p_asiento_linea: mov, p_lineas: lineas });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/tesoreria/conciliaciones`);
}

// Concilia una línea del banco con un movimiento de libros que difiere por pocos
// colones, mandando la diferencia a la cuenta de redondeo.
export async function conciliarRedondeo(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const linea = String(formData.get("linea_id") ?? "");
  const mov = String(formData.get("asiento_linea_id") ?? "");
  if (!linea || !mov) throw new Error("Elegí un movimiento de libros y una línea del banco.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliar_redondeo", { p_linea: linea, p_asiento_linea: mov });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/tesoreria/conciliaciones`);
}

export async function desconciliarLinea(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const linea = String(formData.get("linea_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desconciliar_linea", { p_linea: linea });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/tesoreria/conciliaciones`);
}

// Registra el asiento de una línea del banco que no estaba en libros (comisión,
// interés, SINPE) y la empareja. Debe/Haber del banco según entre o salga plata.
export async function registrarAsientoBanco(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("tesoreria.conciliar");
  const lineaId = String(formData.get("linea_id") ?? "");
  const contra = String(formData.get("cuenta_contra_id") ?? "");
  const centro = String(formData.get("centro_costo_id") ?? "").trim();
  const glosa = String(formData.get("glosa") ?? "").trim();
  if (!contra) return { error: "Elegí la cuenta de contrapartida." };

  const supabase = await createClient();
  const { data: linea } = await supabase
    .from("estado_cuenta_lineas")
    .select("id, fecha, debito, credito, descripcion, conciliacion:conciliaciones_banco(cuenta_id)")
    .eq("id", lineaId)
    .single();
  if (!linea) return { error: "Línea del banco inexistente." };
  const l = linea as unknown as {
    fecha: string;
    debito: number;
    credito: number;
    descripcion: string | null;
    conciliacion: { cuenta_id: string };
  };
  const banco = l.conciliacion.cuenta_id;
  const entra = Number(l.credito) > 0; // crédito del banco = entra plata
  const monto = entra ? Number(l.credito) : Number(l.debito);

  const lineaBanco = entra
    ? { cuenta_id: banco, debito: monto, detalle: "Banco" }
    : { cuenta_id: banco, credito: monto, detalle: "Banco" };
  const lineaContra = entra
    ? { cuenta_id: contra, credito: monto, centro_costo_id: centro || null, detalle: glosa || "Conciliación" }
    : { cuenta_id: contra, debito: monto, centro_costo_id: centro || null, detalle: glosa || "Conciliación" };

  const { data: asientoId, error } = await supabase.rpc("app_crear_asiento", {
    p_tipo: entra ? "ingreso" : "egreso",
    p_fecha: l.fecha,
    p_glosa: glosa || l.descripcion || "Conciliación bancaria",
    p_lineas: [lineaBanco, lineaContra],
    p_confirmar: true,
  });
  if (error || !asientoId) return { error: limpiar(error?.message ?? "No se pudo crear el asiento.") };

  const { data: al } = await supabase
    .from("asientos_lineas")
    .select("id")
    .eq("asiento_id", asientoId)
    .eq("cuenta_id", banco)
    .single();
  if (al?.id) {
    const { error: e2 } = await supabase.rpc("fn_conciliar_linea", { p_linea: lineaId, p_asiento_linea: al.id });
    if (e2) return { error: limpiar(e2.message) };
  }
  revalidatePath(`/tesoreria/conciliaciones`);
  return { ok: "Asiento registrado y conciliado." };
}

export async function marcarConciliada(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_marcar_conciliada", { p_conciliacion: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath(`/tesoreria/conciliaciones/${id}`);
  revalidatePath("/tesoreria/conciliaciones");
}

export async function anularConciliacion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_conciliacion", { p_conciliacion: id, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/tesoreria/conciliaciones/${id}`);
  revalidatePath("/tesoreria/conciliaciones");
  return { ok: "Conciliación anulada." };
}
