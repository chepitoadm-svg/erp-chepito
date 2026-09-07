"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { leerVentasExternas } from "@/lib/xlsx/ventasExternas";

type R = { error?: string; ok?: string };

export async function guardarVentaExt(clienteId: string, fecha: string, monto: number): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_venta_ext", {
    p_cliente: clienteId,
    p_fecha: fecha,
    p_monto: Number.isFinite(monto) ? monto : 0,
  });
  if (error) return { error: error.message };
  return { ok: "Guardado." };
}

export async function guardarClienteExt(id: string | null, nombre: string, orden: number): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_cliente_ext", {
    p_id: id,
    p_nombre: nombre,
    p_orden: orden,
  });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  return { ok: "Guardado." };
}

export async function desactivarClienteExt(id: string, activo: boolean): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desactivar_cliente_ext", { p_id: id, p_activo: activo });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  return { ok: "Actualizado." };
}

export async function guardarSalidaExt(
  id: string | null,
  fecha: string,
  descripcion: string,
  monto: number,
): Promise<R> {
  await requerirPermiso("ventas.registrar");
  if (!fecha) return { error: "Poné la fecha." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_salida_ext", {
    p_id: id,
    p_fecha: fecha,
    p_descripcion: descripcion || null,
    p_monto: monto,
  });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  return { ok: "Guardado." };
}

export async function borrarSalidaExt(id: string): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_borrar_salida_ext", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/ventas/externas");
  return { ok: "Borrado." };
}

export async function importarVentasExt(formData: FormData): Promise<R> {
  await requerirPermiso("ventas.registrar");
  const anio = Number(formData.get("anio"));
  const mes = Number(formData.get("mes"));
  const file = formData.get("archivo");
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return { error: "Mes inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí el Excel." };

  const { filas, error: pErr } = leerVentasExternas(Buffer.from(await file.arrayBuffer()), anio, mes);
  if (pErr) return { error: pErr };
  if (filas.length === 0) return { error: "No encontré ventas en el archivo." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_importar_ventas_ext", { p_filas: filas });
  if (error) return { error: error.message };
  const res = (data ?? [])[0] as { celdas: number; clientes_nuevos: number } | undefined;
  revalidatePath("/ventas/externas");
  return {
    ok: `${res?.celdas ?? 0} venta(s) importada(s)` + (res?.clientes_nuevos ? `, ${res.clientes_nuevos} cliente(s) nuevo(s).` : "."),
  };
}
