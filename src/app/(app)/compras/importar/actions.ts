"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import {
  parseComprasExcel,
  type CompraExcelFila,
  type ResumenComprasExcel,
} from "@/lib/xlsx/comprasExcel";

export interface FormState {
  error?: string;
  ok?: string;
}

export interface AnalisisComprasState {
  error?: string;
  filas?: number;
  total?: number;
  pagadas?: number;
  centros?: { codigo: string; n: number; total: number; iva: number }[];
  proveedores?: { razon: string; estado: "existe" | "nuevo" }[];
  ignoradas?: { bodega: string; total: number }[];
  filas_data?: CompraExcelFila[]; // para el paso de importar (sin re-subir)
}

function limpiar(msg: string): string {
  return msg.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || msg;
}

// Normaliza un nombre para casar proveedores (mayúsculas, sin acentos/símbolos).
function normNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emparejar(razon: string, proveedores: { id: string; nombre: string }[]): string | null {
  const n = normNombre(razon);
  const exact = proveedores.find((p) => normNombre(p.nombre) === n);
  if (exact) return exact.id;
  if (n.length >= 5) {
    const sub = proveedores.find((p) => {
      const pn = normNombre(p.nombre);
      return pn.includes(n) || (pn.length >= 5 && n.includes(pn));
    });
    if (sub) return sub.id;
  }
  return null;
}

async function leerExcel(formData: FormData): Promise<ResumenComprasExcel> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Subí el Excel de compras.");
  const buf = new Uint8Array(await archivo.arrayBuffer());
  return parseComprasExcel(buf);
}

export async function analizarCompras(
  _prev: AnalisisComprasState,
  formData: FormData,
): Promise<AnalisisComprasState> {
  await requerirPermiso("compras.facturar");
  let resumen: ResumenComprasExcel;
  try {
    resumen = await leerExcel(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el Excel." };
  }
  if (!resumen.filas.length) return { error: "El Excel no trae compras con bodega/centro." };

  const supabase = await createClient();
  const { data: provs } = await supabase.from("proveedores").select("id, nombre").eq("estado", "activo");
  const proveedores = (provs ?? []) as { id: string; nombre: string }[];

  const porCentro = new Map<string, { n: number; total: number; iva: number }>();
  for (const f of resumen.filas) {
    const a = porCentro.get(f.centro_codigo) ?? { n: 0, total: 0, iva: 0 };
    a.n++;
    a.total += f.total;
    a.iva += f.iva;
    porCentro.set(f.centro_codigo, a);
  }

  return {
    filas: resumen.filas.length,
    total: Math.round(resumen.filas.reduce((s, f) => s + f.total, 0) * 100) / 100,
    pagadas: resumen.filas.filter((f) => f.cancelada).length,
    centros: [...porCentro.entries()]
      .map(([codigo, a]) => ({ codigo, n: a.n, total: Math.round(a.total * 100) / 100, iva: Math.round(a.iva * 100) / 100 }))
      .sort((x, y) => x.codigo.localeCompare(y.codigo)),
    proveedores: resumen.proveedores.map((razon) => ({
      razon,
      estado: emparejar(razon, proveedores) ? "existe" : "nuevo",
    })),
    ignoradas: resumen.ignoradas_sin_centro,
    filas_data: resumen.filas,
  };
}

export async function importarCompras(_prev: FormState, formData: FormData): Promise<FormState> {
  await requerirPermiso("compras.facturar");
  let filas: CompraExcelFila[];
  try {
    filas = JSON.parse(String(formData.get("filas") ?? "[]"));
  } catch {
    return { error: "No se pudo leer el detalle." };
  }
  if (!Array.isArray(filas) || filas.length === 0) return { error: "No hay compras para importar." };
  const razones = [...new Set(filas.map((f) => f.razon_comercial).filter(Boolean))];

  const supabase = await createClient();
  const { data: provs } = await supabase.from("proveedores").select("id, nombre").eq("estado", "activo");
  const proveedores = (provs ?? []) as { id: string; nombre: string }[];
  const { data: centrosData } = await supabase
    .from("centros_costo")
    .select("id, codigo")
    .in("codigo", ["CH1", "CH2", "TAL"]);
  const centro = new Map((centrosData ?? []).map((c) => [c.codigo, c.id]));
  const { data: ctas } = await supabase
    .from("cuentas")
    .select("id, codigo")
    .in("codigo", ["51-10-01-00-00", "51-10-02-00-00"]);
  const cta01 = ctas?.find((c) => c.codigo === "51-10-01-00-00")?.id;
  const cta02 = ctas?.find((c) => c.codigo === "51-10-02-00-00")?.id;
  if (!cta01 || !cta02) return { error: "Faltan las cuentas de compras (51-10-01 / 51-10-02)." };

  // Proveedor por razón comercial: casar o crear (cédula temporal única).
  const provMap = new Map<string, string>();
  let creados = 0;
  for (const razon of razones) {
    let id = emparejar(razon, proveedores);
    if (!id) {
      const cedulaTmp = ("IMP-" + normNombre(razon).replace(/ /g, "-")).slice(0, 20);
      const { data: nuevo, error } = await supabase
        .from("proveedores")
        .insert({ nombre: razon, cedula_juridica: cedulaTmp })
        .select("id, nombre")
        .single();
      if (error || !nuevo) continue; // si falla, las filas de ese proveedor caerán en error
      id = nuevo.id;
      proveedores.push(nuevo as { id: string; nombre: string });
      creados++;
    }
    provMap.set(razon, id);
  }

  let ok = 0;
  let dup = 0;
  let err = 0;
  let primerError = "";
  for (const f of filas) {
    const prov = provMap.get(f.razon_comercial);
    const cen = centro.get(f.centro_codigo);
    if (!prov || !cen) {
      err++;
      continue;
    }
    const cuenta = f.gravado >= f.exento ? cta02 : cta01;
    const { data: id, error } = await supabase.rpc("fn_crear_factura_gasto", {
      p_proveedor: prov,
      p_clave: f.factura || null,
      p_fecha: f.fecha,
      p_condicion: null,
      p_plazo: 0,
      p_cuenta_gasto: cuenta,
      p_centro: cen,
      p_subtotal: Math.round((f.gravado + f.exento) * 100) / 100,
      p_iva_total: f.iva,
      p_glosa: `Import Excel · ${f.bodega}`,
    });
    if (error || !id) {
      if ((error?.message ?? "").includes("clave")) dup++;
      else {
        err++;
        if (!primerError) primerError = limpiar(error?.message ?? "");
      }
      continue;
    }
    const { error: e2 } = await supabase.rpc("fn_confirmar_factura", { p_factura: id });
    if (e2) {
      err++;
      if (!primerError) primerError = limpiar(e2.message);
    } else ok++;
  }

  revalidatePath("/compras/facturas");
  revalidatePath("/compras/cxp");
  const partes = [`${ok} compras importadas y posteadas`];
  if (creados > 0) partes.push(`${creados} proveedores nuevos`);
  if (dup > 0) partes.push(`${dup} ya existían`);
  if (err > 0) partes.push(`${err} con error${primerError ? ` (${primerError})` : ""}`);
  return { ok: partes.join(" · ") };
}
