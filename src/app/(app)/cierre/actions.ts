"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPermiso } from "@/lib/auth/permisos";
import { leerRetiros } from "@/lib/xlsx/retirosCaja";
import { leerRetirosDepositos } from "@/lib/pdf/retirosDepositos";

const BUCKET = "cierre";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por archivo

type R = { error?: string; ok?: string };

export async function generarCierre(anio: number, mes: number): Promise<{ error?: string; id?: string }> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_generar_cierre", { p_anio: anio, p_mes: mes });
  if (error) return { error: error.message };
  revalidatePath("/cierre");
  return { id: data as string };
}

export async function marcarItem(itemId: string, estado: string, nota?: string): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_marcar_item", { p_item: itemId, p_estado: estado, p_nota: nota ?? null });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: "Listo." };
}

export async function subirArchivo(formData: FormData): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const itemId = String(formData.get("item_id") ?? "");
  const file = formData.get("archivo");
  if (!itemId) return { error: "Falta el requisito." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo." };
  if (file.size > MAX_BYTES) return { error: "El archivo supera los 25 MB." };

  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${itemId}/${Date.now()}-${safe}`;

  const admin = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return { error: `No se pudo subir: ${upErr.message}` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_archivo_cierre", {
    p_item: itemId,
    p_path: path,
    p_nombre: file.name,
    p_tamano: file.size,
    p_mime: file.type || null,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]); // no dejar huérfano
    return { error: error.message };
  }
  revalidatePath("/cierre", "layout");
  return { ok: "Archivo subido." };
}

export async function anularArchivo(archivoId: string): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_archivo_cierre", { p_archivo: archivoId });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: "Archivo quitado." };
}

export async function cerrarMes(cierreId: string, cerrar: boolean): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cerrar_mes", { p_cierre: cierreId, p_cerrar: cerrar });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: cerrar ? "Mes cerrado." : "Mes reabierto." };
}

export async function guardarRequisito(formData: FormData): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const id = String(formData.get("id") ?? "").trim() || null;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const grupo = String(formData.get("grupo") ?? "").trim();
  const alcance = String(formData.get("alcance") ?? "");
  const auto = String(formData.get("auto_fuente") ?? "").trim();
  const centrosRaw = formData.getAll("centros").map((c) => String(c)).filter(Boolean);
  const requiereArchivo = formData.get("requiere_archivo") === "on";
  const orden = Number(formData.get("orden") ?? 100);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_requisito", {
    p_id: id,
    p_nombre: nombre,
    p_grupo: grupo,
    p_alcance: alcance,
    p_auto: auto || "",
    p_centros: alcance === "centro" && centrosRaw.length > 0 ? centrosRaw : null,
    p_requiere_archivo: requiereArchivo,
    p_orden: Number.isFinite(orden) ? orden : 100,
  });
  if (error) return { error: error.message };
  revalidatePath("/cierre/requisitos");
  return { ok: "Guardado." };
}

export async function desactivarRequisito(id: string, activo: boolean): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desactivar_requisito", { p_id: id, p_activo: activo });
  if (error) return { error: error.message };
  revalidatePath("/cierre/requisitos");
  return { ok: "Actualizado." };
}

// ---- Retiros de caja ------------------------------------------------------

export async function importarRetiros(formData: FormData): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("cierre.gestionar");
  let centroId = String(formData.get("centro_id") ?? "");
  const centroCodigo = String(formData.get("centro_codigo") ?? "").trim();
  const anio = Number(formData.get("anio"));
  const mes = Number(formData.get("mes"));
  const file = formData.get("archivo");
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return { error: "Mes inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí el Excel de retiros." };

  const supabaseId = await createClient();
  if (!centroId && centroCodigo) {
    const { data: c } = await supabaseId
      .from("centros_costo")
      .select("id")
      .eq("codigo", centroCodigo.toUpperCase())
      .single();
    if (!c) return { error: "Centro inválido." };
    centroId = c.id;
  }
  if (!centroId) return { error: "Falta el centro." };

  const { filas, error: pErr } = leerRetiros(Buffer.from(await file.arrayBuffer()));
  if (pErr) return { error: pErr };
  if (filas.length === 0) return { error: "No encontré retiros en el archivo." };

  const { data, error } = await supabaseId.rpc("fn_importar_retiros", {
    p_centro: centroId,
    p_anio: anio,
    p_mes: mes,
    p_filas: filas,
  });
  if (error) return { error: error.message };
  const res = (data ?? [])[0] as { insertados: number; duplicados: number } | undefined;
  revalidatePath("/cierre", "layout");
  return {
    ok: `${res?.insertados ?? 0} retiro(s) nuevo(s)` + (res?.duplicados ? `, ${res.duplicados} ya estaban.` : "."),
  };
}

export async function importarRetirosDep(formData: FormData): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("cierre.gestionar");
  const anio = Number(formData.get("anio"));
  const mes = Number(formData.get("mes"));
  const file = formData.get("archivo");
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return { error: "Mes inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí el PDF de retiros/depósitos." };

  const { filas, error: pErr } = await leerRetirosDepositos(Buffer.from(await file.arrayBuffer()));
  if (pErr) return { error: pErr };
  if (filas.length === 0) return { error: "No encontré retiros en el PDF." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_importar_retiros_dep", {
    p_anio: anio,
    p_mes: mes,
    p_filas: filas,
  });
  if (error) return { error: error.message };
  const res = (data ?? [])[0] as { insertados: number; duplicados: number } | undefined;
  revalidatePath("/cierre", "layout");
  return {
    ok: `${res?.insertados ?? 0} retiro(s) nuevo(s)` + (res?.duplicados ? `, ${res.duplicados} ya estaban.` : "."),
  };
}

export async function agregarRetiroManual(
  fecha: string,
  motivo: string,
  monto: number,
  fuente: string = "venta_ext",
): Promise<R> {
  await requerirPermiso("ventas.registrar");
  if (!fecha) return { error: "Poné la fecha." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_agregar_retiro_manual", {
    p_fecha: fecha,
    p_monto: monto,
    p_motivo: motivo || null,
    p_fuente: fuente,
  });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  revalidatePath("/cierre", "layout");
  return { ok: "Agregado." };
}

export async function borrarRetiro(id: string): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_borrar_retiro", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  revalidatePath("/cierre", "layout");
  return { ok: "Borrado." };
}

export async function marcarRetiro(id: string, estado: string): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_marcar_retiro", { p_retiro: id, p_estado: estado });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: "Listo." };
}

// Deshacer un retiro ingresado: revierte el movimiento generado (pago de
// planilla / proveedor / gasto: anula su asiento y restaura saldos) y lo deja
// pendiente otra vez.
export async function deshacerRetiro(id: string): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_deshacer_retiro", { p_retiro: id, p_motivo: "Deshecho desde retiros" });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: "Deshecho." };
}

export async function enlazarRetiro(id: string, gastoId: string): Promise<R> {
  await requerirPermiso("cierre.gestionar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_enlazar_retiro", { p_retiro: id, p_gasto: gastoId });
  if (error) return { error: error.message };
  revalidatePath("/cierre", "layout");
  return { ok: "Enlazado." };
}

// Salda el retiro pagando una PLANILLA (aparece en la pantalla de planilla y
// baja su saldo). Postea Debe salarios por pagar / Haber caja y lo amarra.
export async function pagarPlanillaDesdeRetiro(
  retiroId: string,
  planillaId: string,
  cuentaId: string,
  monto: number,
): Promise<{ error?: string; ok?: string; asientoId?: string; numero?: number }> {
  await requerirPermiso("gastos.registrar");
  if (!planillaId) return { error: "Elegí la planilla." };
  if (!cuentaId) return { error: "Elegí de qué caja salió." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("retiro_caja")
    .select("fecha, estado")
    .eq("id", retiroId)
    .single();
  if (!r) return { error: "Retiro inexistente." };
  if (r.estado === "ingresado") return { error: "Este retiro ya está ingresado." };

  const { data: asientoId, error: ePago } = await supabase.rpc("fn_pagar_planilla", {
    p_planilla: planillaId,
    p_cuenta: cuentaId,
    p_fecha: r.fecha,
    p_monto: monto,
  });
  if (ePago || !asientoId) return { error: ePago?.message ?? "No se pudo pagar la planilla." };

  const { data: pp } = await supabase
    .from("planilla_pagos")
    .select("id, asiento:asientos(numero)")
    .eq("asiento_id", asientoId as string)
    .single();
  if (!pp) return { error: "Se pagó la planilla pero no se pudo enlazar el retiro." };

  const { error: eLink } = await supabase.rpc("fn_enlazar_planilla_retiro", {
    p_retiro: retiroId,
    p_pago: pp.id,
  });
  if (eLink) return { error: eLink.message };

  const asiento = pp.asiento ? (Array.isArray(pp.asiento) ? pp.asiento[0] : pp.asiento) : null;
  revalidatePath("/cierre", "layout");
  return { ok: "Planilla pagada.", asientoId: asientoId as string, numero: asiento?.numero ?? undefined };
}

// Registra el retiro como gasto pagado de caja, lo postea (asiento Debe gasto /
// Haber caja) y lo enlaza. Devuelve el asiento para verlo de una.
export async function ingresarRetiroGasto(
  retiroId: string,
  cuentaGastoId: string,
  cuentaPagoId: string,
  iva: number,
  centroId?: string,
): Promise<{ error?: string; ok?: string; asientoId?: string; numero?: number }> {
  await requerirPermiso("gastos.registrar");
  if (!cuentaGastoId) return { error: "Elegí la cuenta de gasto." };
  if (!cuentaPagoId) return { error: "Elegí de qué caja salió." };

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("retiro_caja")
    .select("centro_id, fecha, monto, motivo, estado, gasto_id")
    .eq("id", retiroId)
    .single();
  if (!r) return { error: "Retiro inexistente." };
  if (r.estado === "ingresado" && r.gasto_id) return { error: "Este retiro ya está ingresado." };

  const total = Number(r.monto);
  const ivaN = Math.max(0, Math.min(iva || 0, total));
  const subtotal = Math.round((total - ivaN) * 100) / 100;

  const { data: gastoId, error: eCrear } = await supabase.rpc("fn_crear_gasto", {
    p_centro: centroId || r.centro_id,
    p_fecha: r.fecha,
    p_cuenta_gasto: cuentaGastoId,
    p_cuenta_pago: cuentaPagoId,
    p_subtotal: subtotal,
    p_iva: ivaN,
    p_descripcion: r.motivo ?? "Retiro de caja",
  });
  if (eCrear || !gastoId) return { error: eCrear?.message ?? "No se pudo crear el gasto." };

  const { error: eConf } = await supabase.rpc("fn_confirmar_gasto", { p_gasto: gastoId as string });
  if (eConf) return { error: `Gasto creado pero no se posteó: ${eConf.message}` };

  const { error: eLink } = await supabase.rpc("fn_enlazar_retiro", { p_retiro: retiroId, p_gasto: gastoId as string });
  if (eLink) return { error: eLink.message };

  const { data: g } = await supabase
    .from("gastos")
    .select("asiento_id, asiento:asientos(numero)")
    .eq("id", gastoId as string)
    .single();
  const asiento = g?.asiento ? (Array.isArray(g.asiento) ? g.asiento[0] : g.asiento) : null;

  revalidatePath("/cierre", "layout");
  return { ok: "Gasto posteado.", asientoId: g?.asiento_id ?? undefined, numero: asiento?.numero ?? undefined };
}

// Salda el retiro PAGANDO una factura del proveedor (CxP) desde caja. Crea el
// pago, lo postea (Debe CxP / Haber caja) y lo amarra al retiro.
export async function pagarFacturaDesdeRetiro(
  retiroId: string,
  proveedorId: string,
  cxpId: string,
  cuentaPagoId: string,
  monto: number,
  saldar: boolean = false,
  cuentaDif: string = "",
  centroDif: string = "",
): Promise<{ error?: string; ok?: string; asientoId?: string; numero?: number }> {
  await requerirPermiso("compras.pagar");
  if (!proveedorId || !cxpId) return { error: "Elegí la factura por pagar." };
  if (!cuentaPagoId) return { error: "Elegí de qué caja salió." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("retiro_caja")
    .select("fecha, control_caja, motivo, estado")
    .eq("id", retiroId)
    .single();
  if (!r) return { error: "Retiro inexistente." };
  if (r.estado === "ingresado") return { error: "Este retiro ya está ingresado." };

  let pagoId: string | null = null;

  if (saldar) {
    // Salda la factura completa: sale `monto` de caja y la diferencia (a favor)
    // va a la cuenta de ingreso elegida. Postea el asiento de 3 líneas.
    if (!cuentaDif) return { error: "Elegí la cuenta para la diferencia." };
    if (!centroDif) return { error: "Elegí el centro de costo de la diferencia." };
    const { data, error } = await supabase.rpc("fn_pagar_factura_caja_dif", {
      p_retiro: retiroId,
      p_cxp: cxpId,
      p_cuenta_caja: cuentaPagoId,
      p_monto_caja: monto,
      p_cuenta_dif: cuentaDif,
      p_centro_dif: centroDif,
    });
    if (error || !data) return { error: error?.message ?? "No se pudo pagar la factura." };
    pagoId = data as string;
  } else {
    // Pago normal (parcial o exacto): deja saldo si es menor.
    const { data, error: eCrear } = await supabase.rpc("fn_crear_pago", {
      p_proveedor: proveedorId,
      p_fecha: r.fecha,
      p_medio: "efectivo",
      p_cuenta_pago: cuentaPagoId,
      p_referencia: r.control_caja ?? null,
      p_glosa: r.motivo ?? "Pago de factura (retiro de caja)",
      p_lineas: [{ cxp_id: cxpId, monto }],
    });
    if (eCrear || !data) return { error: eCrear?.message ?? "No se pudo crear el pago." };
    pagoId = data as string;
    const { error: eConf } = await supabase.rpc("fn_confirmar_pago", { p_pago: pagoId });
    if (eConf) return { error: `Pago creado pero no se posteó: ${eConf.message}` };
  }

  const { error: eLink } = await supabase.rpc("fn_enlazar_pago_retiro", { p_retiro: retiroId, p_pago: pagoId });
  if (eLink) return { error: eLink.message };

  const { data: pp } = await supabase
    .from("pagos_proveedor")
    .select("asiento_id, asiento:asientos(numero)")
    .eq("id", pagoId as string)
    .single();
  const asiento = pp?.asiento ? (Array.isArray(pp.asiento) ? pp.asiento[0] : pp.asiento) : null;

  revalidatePath("/cierre", "layout");
  return { ok: "Factura pagada.", asientoId: pp?.asiento_id ?? undefined, numero: asiento?.numero ?? undefined };
}
