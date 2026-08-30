"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { parseLiquidacionDatafono, type LiquidacionDatafono } from "@/lib/txt/datafonoCredomatic";

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

export interface DatafonoState {
  error?: string;
  ok?: string;
  centro_costo_id?: string;
  centro_nombre?: string;
  liq?: LiquidacionDatafono;
  pos_tarjeta?: number;
  diferencia?: number; // (débitos − POS): a Diferencias voucher
}

export async function analizarDatafono(_prev: DatafonoState, formData: FormData): Promise<DatafonoState> {
  await requerirPermiso("tesoreria.conciliar");
  const centro = String(formData.get("centro_costo_id") ?? "");
  if (!centro) return { error: "Elegí el negocio (Chepito 1 o 2)." };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Subí el TXT de Credomatic." };

  let liq: LiquidacionDatafono;
  try {
    const texto = new TextDecoder("latin1").decode(new Uint8Array(await archivo.arrayBuffer()));
    liq = parseLiquidacionDatafono(texto);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }

  const supabase = await createClient();
  const { data: c } = await supabase.from("centros_costo").select("nombre").eq("id", centro).single();

  const [y, m] = liq.periodo.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  const { data: ventas } = await supabase
    .from("ventas_dia")
    .select("tarjeta")
    .eq("centro_costo_id", centro)
    .eq("estado", "confirmado")
    .gte("fecha", liq.periodo)
    .lte("fecha", hasta);
  const pos = Math.round((ventas ?? []).reduce((s, v: { tarjeta: number }) => s + Number(v.tarjeta), 0) * 100) / 100;

  const debitos = liq.neto_banco + liq.comision + liq.servicios + liq.ret_iva + liq.ret_renta;
  const diferencia = Math.round((debitos - pos) * 100) / 100;

  return { centro_costo_id: centro, centro_nombre: c?.nombre ?? "", liq, pos_tarjeta: pos, diferencia };
}

export async function registrarDatafono(_prev: DatafonoState, formData: FormData): Promise<DatafonoState> {
  await requerirPermiso("tesoreria.conciliar");
  const centro = String(formData.get("centro_costo_id") ?? "");
  const periodo = String(formData.get("periodo") ?? "");
  const n = (k: string) => Number(formData.get(k) ?? 0);
  if (!centro || !periodo) return { error: "Falta el negocio o el mes." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_registrar_liquidacion_datafono", {
    p_centro: centro,
    p_periodo: periodo,
    p_comision: n("comision"),
    p_servicios: n("servicios"),
    p_ret_iva: n("ret_iva"),
    p_ret_renta: n("ret_renta"),
    p_neto_banco: n("neto_banco"),
    p_pos_tarjeta: n("pos_tarjeta"),
    p_facturacion: n("facturacion"),
  });
  if (error) {
    return {
      error: error.message.includes("liquidaciones_datafono_unica")
        ? "Ya hay una liquidación registrada para ese negocio en ese mes."
        : limpiar(error.message),
    };
  }
  revalidatePath("/tesoreria/datafono");
  revalidatePath("/reportes/flujo");
  return { ok: "Liquidación registrada y posteada. El datafono quedó cerrado." };
}
