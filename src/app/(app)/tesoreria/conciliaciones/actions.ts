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

// Anexa más movimientos del .xls a una conciliación en borrador (subir por partes).
export async function agregarEstadoCuenta(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta la conciliación." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Subí el estado de cuenta (.xls)." };

  let ec;
  try {
    ec = parseEstadoCuentaBAC(new Uint8Array(await archivo.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el estado de cuenta." };
  }

  const supabase = await createClient();
  const { data: agregadas, error } = await supabase.rpc("fn_agregar_lineas_conciliacion", {
    p_conciliacion: id,
    p_saldo_final: ec.saldo_final,
    p_lineas: ec.lineas,
  });
  if (error) return { error: limpiar(error.message) };

  const { data: c } = await supabase.from("conciliaciones_banco").select("cuenta_id").eq("id", id).single();
  if (c?.cuenta_id) await autoEmparejar(supabase, id, c.cuenta_id as string);

  revalidatePath(`/tesoreria/conciliaciones/${id}`);
  const n = Number(agregadas ?? 0);
  return { ok: n === 0 ? "No había movimientos nuevos (ya estaban todos)." : `Se agregaron ${n} movimiento(s) nuevo(s).` };
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
  // Si la base rechaza (ej. la línea ya se concilió en otra pestaña) NO reventamos
  // la pantalla: revalidamos para reflejar el estado real. El usuario ve el resultado.
  await supabase.rpc("fn_conciliar_linea", { p_linea: linea, p_asiento_linea: mov });
  // "layout" cae en cascada sobre la página de detalle [id] (donde se opera),
  // no solo el listado, para que la pantalla refleje el cambio de una vez.
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
}

// Empareja UN movimiento de libros con VARIAS líneas del banco (si la suma calza).
export async function conciliarGrupo(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const mov = String(formData.get("asiento_linea_id") ?? "");
  const lineas = String(formData.get("lineas") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!mov || lineas.length === 0) return;
  const supabase = await createClient();
  await supabase.rpc("fn_conciliar_grupo", { p_asiento_linea: mov, p_lineas: lineas });
  // "layout" cae en cascada sobre la página de detalle [id] (donde se opera),
  // no solo el listado, para que la pantalla refleje el cambio de una vez.
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
}

// Concilia una línea del banco con un movimiento de libros que difiere por pocos
// colones, mandando la diferencia a la cuenta de redondeo.
export async function conciliarRedondeo(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const linea = String(formData.get("linea_id") ?? "");
  const mov = String(formData.get("asiento_linea_id") ?? "");
  if (!linea || !mov) throw new Error("Elegí un movimiento de libros y una línea del banco.");
  const supabase = await createClient();
  await supabase.rpc("fn_conciliar_redondeo", { p_linea: linea, p_asiento_linea: mov });
  // "layout" cae en cascada sobre la página de detalle [id] (donde se opera),
  // no solo el listado, para que la pantalla refleje el cambio de una vez.
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
}

export async function desconciliarLinea(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const linea = String(formData.get("linea_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("fn_desconciliar_linea", { p_linea: linea });
  // "layout" cae en cascada sobre la página de detalle [id] (donde se opera),
  // no solo el listado, para que la pantalla refleje el cambio de una vez.
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
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

  // Si la contrapartida es una CUENTA DE GASTO y sale plata, no creamos un
  // asiento suelto: lo registramos como un Gasto de verdad, para que aparezca
  // en el auxiliar de Gastos (y cuadre con flujo/Estado de Resultados). El
  // asiento directo queda solo para ingresos/ajustes que no tienen auxiliar.
  const { data: ctaContra } = await supabase.from("cuentas").select("tipo").eq("id", contra).single();
  if (!entra && (ctaContra as { tipo: string } | null)?.tipo === "gasto") {
    if (!centro) return { error: "Elegí el centro de costo del gasto." };
    const { data: gastoId, error: eg } = await supabase.rpc("fn_crear_gasto", {
      p_centro: centro,
      p_fecha: l.fecha,
      p_cuenta_gasto: contra,
      p_cuenta_pago: banco,
      p_subtotal: monto,
      p_iva: 0,
      p_descripcion: glosa || l.descripcion || "Gasto",
    });
    if (eg || !gastoId) return { error: limpiar(eg?.message ?? "No se pudo crear el gasto.") };
    const { data: asientoGasto, error: ecg } = await supabase.rpc("fn_confirmar_gasto", { p_gasto: gastoId });
    if (ecg || !asientoGasto) return { error: limpiar(ecg?.message ?? "No se pudo confirmar el gasto.") };
    const { data: alg } = await supabase
      .from("asientos_lineas")
      .select("id")
      .eq("asiento_id", asientoGasto)
      .eq("cuenta_id", banco)
      .single();
    if (alg?.id) {
      const { error: e2 } = await supabase.rpc("fn_conciliar_linea", { p_linea: lineaId, p_asiento_linea: alg.id });
      if (e2) return { error: limpiar(e2.message) };
    }
    revalidatePath(`/tesoreria/conciliaciones`, "layout");
    return { ok: "Gasto registrado y conciliado. Ya aparece en el auxiliar de Gastos." };
  }

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
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
  return { ok: "Asiento registrado y conciliado." };
}

// Liga un identificador del estado de cuenta con un proveedor (agenda bancaria).
// Genera UN asiento que agrupa VARIAS líneas del banco contra una sola cuenta de
// libros (ej. varios depósitos de ventas → una cuenta de ventas), y concilia todas.
export async function registrarAsientoBancoGrupo(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("tesoreria.conciliar");
  const ids = String(formData.get("lineas") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const contra = String(formData.get("cuenta_contra_id") ?? "");
  const centro = String(formData.get("centro_costo_id") ?? "").trim();
  const glosa = String(formData.get("glosa") ?? "").trim();
  if (ids.length < 2) return { error: "Elegí dos o más líneas del banco." };
  if (!contra) return { error: "Elegí la cuenta de contrapartida." };

  const supabase = await createClient();
  const { data: lineasRaw } = await supabase
    .from("estado_cuenta_lineas")
    .select("id, fecha, debito, credito, descripcion, referencia, conciliacion:conciliaciones_banco(cuenta_id)")
    .in("id", ids);
  const lineas = (lineasRaw ?? []) as unknown as {
    id: string;
    fecha: string;
    debito: number;
    credito: number;
    descripcion: string | null;
    referencia: string | null;
    conciliacion: { cuenta_id: string };
  }[];
  if (lineas.length < 2) return { error: "No se encontraron las líneas del banco." };
  const cc0 = lineas[0].conciliacion as unknown as { cuenta_id: string } | { cuenta_id: string }[];
  const banco = Array.isArray(cc0) ? cc0[0]?.cuenta_id : cc0?.cuenta_id;
  if (!banco) return { error: "No pude identificar la cuenta del banco." };
  if (contra === banco)
    return { error: "La contrapartida no puede ser la misma cuenta del banco (se cancelaría solo). Para depósitos de ventas usá Caja general." };

  const { data: ctaContra } = await supabase.from("cuentas").select("tipo").eq("id", contra).single();
  const tipoContra = (ctaContra as { tipo: string } | null)?.tipo;
  if ((tipoContra === "ingreso" || tipoContra === "gasto") && !centro)
    return { error: "Elegí el centro de costo (la cuenta es de resultado)." };

  // Una línea del banco (GL) por cada movimiento; el detalle guarda la referencia.
  const bancoLineas = lineas.map((l) => {
    const det = `${l.referencia ? l.referencia + " " : ""}${l.descripcion ?? "Banco"}`.slice(0, 120);
    return Number(l.credito) > 0
      ? { cuenta_id: banco, debito: Number(l.credito), detalle: det }
      : { cuenta_id: banco, credito: Number(l.debito), detalle: det };
  });
  const totalCredito = lineas.reduce((s, l) => s + Number(l.credito), 0); // entra plata
  const totalDebito = lineas.reduce((s, l) => s + Number(l.debito), 0); // sale plata
  const netEntra = Math.round((totalCredito - totalDebito) * 100) / 100;
  if (netEntra === 0) return { error: "Las líneas elegidas se cancelan entre sí (neto 0)." };
  const contraLinea =
    netEntra > 0
      ? { cuenta_id: contra, credito: netEntra, centro_costo_id: centro || null, detalle: glosa || "Conciliación (grupo)" }
      : { cuenta_id: contra, debito: -netEntra, centro_costo_id: centro || null, detalle: glosa || "Conciliación (grupo)" };

  const fecha = lineas.map((l) => l.fecha).sort().slice(-1)[0]; // la más reciente
  const { data: asientoId, error } = await supabase.rpc("app_crear_asiento", {
    p_tipo: netEntra > 0 ? "ingreso" : "egreso",
    p_fecha: fecha,
    p_glosa: glosa || `Conciliación de ${lineas.length} movimientos del banco`,
    p_lineas: [...bancoLineas, contraLinea],
    p_confirmar: true,
  });
  if (error || !asientoId) return { error: limpiar(error?.message ?? "No se pudo crear el asiento.") };

  // Emparejar cada línea del banco con su línea GL (por monto, sin repetir).
  const { data: glRaw } = await supabase
    .from("asientos_lineas")
    .select("id, debito, credito")
    .eq("asiento_id", asientoId)
    .eq("cuenta_id", banco);
  const gl = ((glRaw ?? []) as { id: string; debito: number; credito: number }[]).map((g) => ({ ...g, usada: false }));
  const c2 = (n: number) => Math.round(Number(n) * 100);
  let ok = 0;
  for (const l of lineas) {
    const target = Number(l.credito) > 0 ? { d: c2(l.credito), c: 0 } : { d: 0, c: c2(l.debito) };
    const g = gl.find((x) => !x.usada && c2(x.debito) === target.d && c2(x.credito) === target.c);
    if (!g) continue;
    const { error: e2 } = await supabase.rpc("fn_conciliar_linea", { p_linea: l.id, p_asiento_linea: g.id });
    if (!e2) {
      g.usada = true;
      ok++;
    }
  }
  revalidatePath(`/tesoreria/conciliaciones`, "layout");
  return { ok: `Asiento creado. Se conciliaron ${ok} de ${lineas.length} líneas contra una sola cuenta.` };
}

export async function asignarAliasProveedor(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const proveedor = String(formData.get("proveedor_id") ?? "");
  const alias = String(formData.get("alias") ?? "");
  if (!proveedor || !alias.trim()) throw new Error("Elegí un proveedor y el identificador.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_asignar_alias_proveedor", { p_proveedor: proveedor, p_alias: alias });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/tesoreria/conciliaciones", "layout");
  revalidatePath("/tesoreria/proveedores-banco");
}

export async function borrarAliasProveedor(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_borrar_alias_proveedor", { p_id: id });
  if (error) throw new Error(limpiar(error.message));
  revalidatePath("/tesoreria/conciliaciones", "layout");
  revalidatePath("/tesoreria/proveedores-banco");
}

export async function marcarConciliada(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("fn_marcar_conciliada", { p_conciliacion: id });
  revalidatePath(`/tesoreria/conciliaciones/${id}`);
  revalidatePath("/tesoreria/conciliaciones");
}

// Reabre una conciliación marcada por error: vuelve a borrador sin deshacer
// los emparejamientos.
export async function reabrirConciliacion(formData: FormData): Promise<void> {
  await requerirPermiso("tesoreria.conciliar");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("fn_reabrir_conciliacion", { p_conciliacion: id });
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
