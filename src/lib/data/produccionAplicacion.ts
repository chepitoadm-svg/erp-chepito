// Fase 4-2 (Opción 1): calcula el descuento de inventario a partir de la
// producción que viene de la app vieja (consumoMateriaPrima), mapeando cada
// insumo a su ARTÍCULO del ERP (por el enlace que dejó "Convertir").
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { consumoMateriaPrima } from "@/lib/data/produccion";

const FACT_ART: Record<string, number> = { G: 1, KG: 1000, ML: 1, L: 1000, UN: 1, UNIDAD: 1 };
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export interface LineaAplicacion {
  articulo_id: string;
  articulo_nombre: string;
  unidad_stock: string;
  cantidad: number; // en unidad de stock del artículo
  costo_promedio: number;
  valor: number; // cantidad × costo_promedio
}
export interface NoLigado {
  nombre: string;
  base_qty: number;
  unidad: string;
  motivo: string;
}
export interface PreviewAplicacion {
  desde: string;
  hasta: string;
  filas_leidas: number;
  lineas: LineaAplicacion[];
  noLigados: NoLigado[];
}

export async function calcularAplicacionProduccion(desde: string, hasta: string): Promise<PreviewAplicacion> {
  const supabase = await createClient();
  const consumo = await consumoMateriaPrima(desde, hasta);

  // insumo (por nombre) → artículo ligado (lo dejó "Convertir")
  const { data: ims, error: e1 } = await supabase.from("insumos_manuales").select("nombre, articulo_id");
  if (e1) throw new Error(`No se pudieron leer los insumos: ${e1.message}`);
  const artPorNombre = new Map<string, string>();
  (ims ?? []).forEach((i) => {
    if (i.articulo_id) artPorNombre.set(norm(i.nombre as string), i.articulo_id as string);
  });

  // info de los artículos ligados: unidad de stock + costo promedio
  const artIds = Array.from(new Set(artPorNombre.values()));
  const artInfo = new Map<string, { nombre: string; unidad: string; factor: number | null }>();
  const costoProm = new Map<string, number>();
  if (artIds.length) {
    const [arts, unis, sal] = await Promise.all([
      supabase.from("articulos").select("id, nombre, unidad_stock_id").in("id", artIds),
      supabase.from("unidades").select("id, codigo"),
      supabase.from("articulos_saldos").select("articulo_id, costo_promedio").in("articulo_id", artIds),
    ]);
    const uni = new Map((unis.data ?? []).map((u) => [u.id as string, ((u.codigo as string) ?? "").toUpperCase()]));
    (arts.data ?? []).forEach((a) => {
      const code = uni.get(a.unidad_stock_id as string) || "";
      artInfo.set(a.id as string, { nombre: a.nombre as string, unidad: code, factor: FACT_ART[code] ?? null });
    });
    (sal.data ?? []).forEach((s) => costoProm.set(s.articulo_id as string, Number(s.costo_promedio) || 0));
  }

  const acc = new Map<string, number>(); // articulo_id → cantidad en unidad de stock
  const noLigados: NoLigado[] = [];
  for (const ins of consumo.insumos) {
    const art = artPorNombre.get(norm(ins.nombre));
    if (!art) {
      noLigados.push({ nombre: ins.nombre, base_qty: ins.base_qty, unidad: ins.unidad, motivo: "sin convertir a inventario" });
      continue;
    }
    const info = artInfo.get(art);
    if (!info || info.factor == null) {
      noLigados.push({ nombre: ins.nombre, base_qty: ins.base_qty, unidad: ins.unidad, motivo: "el artículo usa una unidad no convertible (ej. saco/caja)" });
      continue;
    }
    acc.set(art, (acc.get(art) ?? 0) + ins.base_qty / info.factor);
  }

  const lineas: LineaAplicacion[] = Array.from(acc.entries())
    .map(([articulo_id, cantidad]) => {
      const info = artInfo.get(articulo_id)!;
      const cp = costoProm.get(articulo_id) ?? 0;
      const cant = Math.round(cantidad * 10000) / 10000;
      return {
        articulo_id,
        articulo_nombre: info.nombre,
        unidad_stock: info.unidad,
        cantidad: cant,
        costo_promedio: cp,
        valor: Math.round(cant * cp * 100) / 100,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  return { desde, hasta, filas_leidas: consumo.filas_leidas, lineas, noLigados };
}

export interface AplicacionListado {
  id: string;
  desde: string;
  hasta: string;
  estado: string;
  creado_en: string;
}
export async function listarAplicaciones(): Promise<AplicacionListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produccion_aplicaciones")
    .select("id, desde, hasta, estado, creado_en")
    .order("creado_en", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron cargar las aplicaciones: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    desde: r.desde as string,
    hasta: r.hasta as string,
    estado: r.estado as string,
    creado_en: r.creado_en as string,
  }));
}

export interface BodegaOpcion {
  id: string;
  codigo: string;
  nombre: string;
}
export async function listarBodegas(): Promise<BodegaOpcion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bodegas").select("id, codigo, nombre").order("codigo");
  if (error) throw new Error(`No se pudieron cargar las bodegas: ${error.message}`);
  return (data ?? []).map((b) => ({ id: b.id as string, codigo: b.codigo as string, nombre: b.nombre as string }));
}

// ¿Hay una aplicación ACTIVA que se traslape con [desde, hasta]? (para no duplicar)
export async function haySolapeAplicacion(desde: string, hasta: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produccion_aplicaciones")
    .select("id")
    .eq("estado", "aplicada")
    .lte("desde", hasta)
    .gte("hasta", desde)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
