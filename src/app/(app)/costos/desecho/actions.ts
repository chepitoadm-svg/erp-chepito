"use server";

import * as xlsx from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import { obtenerCostos, normNombre, type RecetaOpcion } from "@/lib/costos/costosProduccion";

export interface TipoMov {
  tipo: string;
  cantidad: number;
}
export interface ItemDesecho {
  codigo: string;
  tipo: string;
  cantidad: number;
}
export interface ProductoInfo {
  nombre: string;
  costo: number | null; // null = sin receta/costo
}
export interface DesechoState {
  error?: string;
  bodega?: string;
  tipos?: TipoMov[];
  items?: ItemDesecho[];
  productos?: Record<string, ProductoInfo>;
  recetas?: RecetaOpcion[]; // para el selector manual de "sin receta"
  recetasOk?: number;
  costoError?: string;
  // Para postear la reclasificación:
  periodo?: string; // YYYY-MM del archivo
  centro_costo_id?: string;
  centro_codigo?: string;
  compras_total?: number; // compras del centro en el mes (ya prorrateadas)
}

const serialAMes = (serial: number): string => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function analizarDesecho(_prev: DesechoState, formData: FormData): Promise<DesechoState> {
  await requerirPermiso("reportes.financieros.ver");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Subí el Excel de movimientos." };

  let rows: Record<string, unknown>[];
  try {
    const wb = xlsx.read(new Uint8Array(await archivo.arrayBuffer()), { type: "array" });
    rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el Excel." };
  }
  if (!rows.length) return { error: "El Excel está vacío." };

  const col = (r: Record<string, unknown>, ...nombres: string[]): string => {
    for (const n of nombres) if (r[n] != null) return String(r[n]);
    return "";
  };

  // Agrega por (código, tipo) sumando cantidad; junta nombres y tipos.
  const bodegaCount = new Map<string, number>();
  const tipoCant = new Map<string, number>();
  const itemMap = new Map<string, ItemDesecho>(); // key: codigo|tipo
  const nombreDe = new Map<string, string>();
  const mesCount = new Map<string, number>();

  for (const r of rows) {
    const codigo = col(r, "Artículo", "Articulo").trim();
    if (!codigo) continue;
    const nombre = col(r, "Descripción artículo", "Descripcion articulo").trim();
    const tipo = col(r, "Descripción tipo movimiento", "Descripcion tipo movimiento").trim() || "(sin tipo)";
    const cantidad = Number(col(r, "Cantidad")) || 0;
    const bodega = col(r, "Descripción bodega", "Descripcion bodega").trim();
    const fechaSerial = Number(col(r, "Fecha"));
    if (Number.isFinite(fechaSerial) && fechaSerial > 0) {
      const mes = serialAMes(fechaSerial);
      mesCount.set(mes, (mesCount.get(mes) ?? 0) + 1);
    }
    if (bodega) bodegaCount.set(bodega, (bodegaCount.get(bodega) ?? 0) + 1);
    if (nombre) nombreDe.set(codigo, nombre);
    tipoCant.set(tipo, (tipoCant.get(tipo) ?? 0) + cantidad);
    const k = `${codigo}|${tipo}`;
    const it = itemMap.get(k) ?? { codigo, tipo, cantidad: 0 };
    it.cantidad += cantidad;
    itemMap.set(k, it);
  }

  // Costos desde la app de producción.
  const costos = await obtenerCostos();
  const productos: Record<string, ProductoInfo> = {};
  for (const [codigo, nombre] of nombreDe) {
    const costo = costos.porCodigo.get(codigo) ?? costos.porNombre.get(normNombre(nombre)) ?? null;
    productos[codigo] = { nombre, costo: costo == null ? null : Math.round(costo * 100) / 100 };
  }

  const bodega = [...bodegaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const periodo = [...mesCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const tipos: TipoMov[] = [...tipoCant.entries()]
    .map(([tipo, cantidad]) => ({ tipo, cantidad: Math.round(cantidad * 100) / 100 }))
    .sort((a, b) => b.cantidad - a.cantidad);
  const items = [...itemMap.values()].map((i) => ({ ...i, cantidad: Math.round(i.cantidad * 100) / 100 }));

  // Centro (panadería) por la bodega, y total de compras del mes (para la reclasif).
  const supabase = await createClient();
  const codigoCentro = /2/.test(bodega) ? "CH2" : /1/.test(bodega) ? "CH1" : "";
  let centro_costo_id: string | undefined;
  let compras_total: number | undefined;
  if (codigoCentro && periodo) {
    const { data: cen } = await supabase.from("centros_costo").select("id").eq("codigo", codigoCentro).maybeSingle();
    centro_costo_id = cen?.id;
    if (centro_costo_id) {
      const [y, m] = periodo.split("-").map(Number);
      const ini = `${periodo}-01`;
      const fin = `${periodo}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const { data: lineas } = await supabase
        .from("asientos_lineas")
        .select("debito, credito, cuentas!inner(codigo), asientos!inner(estado, tipo, origen_tipo, fecha)")
        .eq("centro_costo_id", centro_costo_id)
        .like("cuentas.codigo", "51-%")
        .eq("asientos.estado", "confirmado")
        .neq("asientos.tipo", "reversion")
        .gte("asientos.fecha", ini)
        .lte("asientos.fecha", fin);
      // Costo NETO = compras (51-10) − devoluciones de compras (51-20-02).
      const tot = ((lineas ?? []) as unknown as {
        debito: number;
        credito: number;
        cuentas: { codigo: string };
        asientos: { origen_tipo: string | null };
      }[])
        .filter(
          (l) =>
            l.asientos.origen_tipo !== "reclasif_costo" &&
            (l.cuentas.codigo.startsWith("51-10-") || l.cuentas.codigo.startsWith("51-20-02-")),
        )
        .reduce((s, l) => s + (Number(l.debito) - Number(l.credito)), 0);
      compras_total = Math.round(tot * 100) / 100;
    }
  }

  return {
    bodega,
    periodo,
    centro_costo_id,
    centro_codigo: codigoCentro,
    compras_total,
    tipos,
    items,
    productos,
    recetas: costos.recetas,
    recetasOk: costos.recetasOk,
    costoError: costos.error,
  };
}

// Postea la reclasificación de costo del mes por panadería (merma + autoconsumo).
export async function postearReclasificacion(
  centroId: string,
  periodo: string,
  merma: number,
  autoconsumo: number,
): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("reportes.financieros.ver");
  if (!centroId || !periodo) return { error: "Falta la panadería o el mes." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_postear_reclasificacion_costo", {
    p_centro: centroId,
    p_periodo: `${periodo}-01`,
    p_merma: merma,
    p_autoconsumo: autoconsumo,
  });
  if (error) {
    return {
      error: error.message.includes("reclasif_costo_unica")
        ? "Ya hay una reclasificación posteada para esa panadería en ese mes."
        : error.message.replace(/^.*?(?=[A-ZÁÉÍÓÚ])/, "").trim() || error.message,
    };
  }
  return { ok: "Reclasificación posteada. El costo del mes quedó separado en vendido / merma / autoconsumo." };
}

export interface LineaDesecho {
  codigo: string;
  nombre: string | null;
  tipo_mov: string | null;
  clase: "merma" | "autoconsumo" | "ignorar";
  cantidad: number;
  costo_unitario: number | null;
  costo_total: number | null;
}

// Guarda (o reemplaza) el snapshot del mes: todos los artículos + totales.
// No postea a contabilidad; solo deja el registro consultable mes a mes.
export async function guardarDesecho(
  centroId: string,
  periodo: string,
  bodega: string,
  compras: number,
  merma: number,
  auto: number,
  vendido: number,
  lineas: LineaDesecho[],
): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("reportes.financieros.ver");
  if (!centroId || !periodo) return { error: "Falta la panadería o el mes." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_guardar_desecho", {
    p_centro: centroId,
    p_periodo: `${periodo}-01`,
    p_bodega: bodega || null,
    p_compras: compras,
    p_merma: merma,
    p_auto: auto,
    p_vendido: vendido,
    p_lineas: lineas,
  });
  if (error) return { error: error.message };
  return { ok: "Snapshot del mes guardado. Podés verlo en el historial." };
}

// El usuario liga a mano un código QuPOS con una receta de la app de producción
// (cuando el auto-match no la encontró). Devuelve el costo para actualizar la UI.
export async function ligarCosto(codigo: string, productoId: string, nombre: string, costo: number): Promise<{ error?: string }> {
  await requerirPermiso("reportes.financieros.ver");
  if (!codigo || !productoId) return { error: "Falta el código o la receta." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_ligar_costo_producto", {
    p_codigo: codigo,
    p_producto_id: productoId,
    p_nombre: nombre,
  });
  if (error) return { error: error.message };
  // costo se recibe del cliente (ya lo tiene de la lista de recetas); solo se persiste el vínculo.
  void costo;
  return {};
}

export async function quitarVinculoCosto(codigo: string): Promise<{ error?: string }> {
  await requerirPermiso("reportes.financieros.ver");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desligar_costo_producto", { p_codigo: codigo });
  if (error) return { error: error.message };
  return {};
}
