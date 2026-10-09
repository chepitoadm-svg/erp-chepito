// Fase 4-2 (Opción 1): calcula el descuento de inventario a partir de la
// producción que viene de la app vieja (consumoMateriaPrima), mapeando cada
// insumo a su ARTÍCULO del ERP (por el enlace que dejó "Convertir").
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { consumoMateriaPrima } from "@/lib/data/produccion";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export interface LineaAplicacion {
  articulo_id: string;
  articulo_nombre: string;
  consumo_base: number; // consumo físico en unidad amigable (kg / L / u)
  consumo_unidad: string; // "kg" | "L" | "u"
  cantidad: number; // en unidad de stock del artículo (= nº de paquetes) — para el movimiento
  costo_promedio: number; // ₡ por unidad de stock (paquete)
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
  problemas: { nombre: string; articulo: string; motivo: string }[];
}

const famOf = (u: string) => (u === "g" || u === "kg" ? "peso" : u === "ml" || u === "L" ? "volumen" : "conteo");
function amigable(base: number, unidadInsumo: string): { v: number; u: string } {
  const f = famOf(unidadInsumo);
  if (f === "peso") return { v: base / 1000, u: "kg" };
  if (f === "volumen") return { v: base / 1000, u: "L" };
  return { v: base, u: "u" };
}

export async function calcularAplicacionProduccion(desde: string, hasta: string): Promise<PreviewAplicacion> {
  const supabase = await createClient();
  const consumo = await consumoMateriaPrima(desde, hasta);

  // insumo (por nombre) → artículo ligado + su TAMAÑO DE COMPRA (ese es el puente
  // confiable: 1 unidad de stock del artículo = 1 paquete del insumo, ej. 1 saco = 25 kg).
  const { data: ims, error: e1 } = await supabase
    .from("insumos_manuales")
    .select("nombre, unidad, cantidad_compra, articulo_id");
  if (e1) throw new Error(`No se pudieron leer los insumos: ${e1.message}`);
  const porNombre = new Map<string, { articulo_id: string; unidad: string; cantidad_compra: number }>();
  (ims ?? []).forEach((i) => {
    if (i.articulo_id) {
      porNombre.set(norm(i.nombre as string), {
        articulo_id: i.articulo_id as string,
        unidad: i.unidad as string,
        cantidad_compra: Number(i.cantidad_compra) || 0,
      });
    }
  });

  // costo promedio + nombre de los artículos ligados
  const artIds = Array.from(new Set(Array.from(porNombre.values()).map((v) => v.articulo_id)));
  const artNombre = new Map<string, string>();
  const costoProm = new Map<string, number>();
  if (artIds.length) {
    const [arts, sal] = await Promise.all([
      supabase.from("articulos").select("id, nombre").in("id", artIds),
      supabase.from("articulos_saldos").select("articulo_id, costo_promedio").in("articulo_id", artIds),
    ]);
    (arts.data ?? []).forEach((a) => artNombre.set(a.id as string, a.nombre as string));
    (sal.data ?? []).forEach((s) => costoProm.set(s.articulo_id as string, Number(s.costo_promedio) || 0));
  }

  // acumular por artículo: cantidad en paquetes (unidad de stock) y consumo físico base
  const acc = new Map<string, { paquetes: number; base: number; unidadInsumo: string }>();
  const noLigados: NoLigado[] = [];
  const problemas: { nombre: string; articulo: string; motivo: string }[] = [];
  for (const ins of consumo.insumos) {
    const m = porNombre.get(norm(ins.nombre));
    if (!m) {
      noLigados.push({ nombre: ins.nombre, base_qty: ins.base_qty, unidad: ins.unidad, motivo: "sin convertir a inventario" });
      continue;
    }
    const paqueteBase = m.cantidad_compra * ({ g: 1, kg: 1000, ml: 1, L: 1000, unidad: 1, porcion: 1 }[m.unidad] ?? 1);
    const artNom = artNombre.get(m.articulo_id) ?? "(artículo)";
    if (paqueteBase <= 0) {
      problemas.push({ nombre: ins.nombre, articulo: artNom, motivo: "el insumo no tiene tamaño de compra (cantidad)" });
      continue;
    }
    const cp = costoProm.get(m.articulo_id) ?? 0;
    if (cp <= 0) {
      problemas.push({ nombre: ins.nombre, articulo: artNom, motivo: "el artículo tiene costo promedio inválido o negativo en el inventario (revisar)" });
      continue;
    }
    const prev = acc.get(m.articulo_id) ?? { paquetes: 0, base: 0, unidadInsumo: ins.unidad };
    prev.paquetes += ins.base_qty / paqueteBase;
    prev.base += ins.base_qty;
    acc.set(m.articulo_id, prev);
  }

  const lineas: LineaAplicacion[] = Array.from(acc.entries())
    .map(([articulo_id, v]) => {
      const cp = costoProm.get(articulo_id) ?? 0;
      const paquetes = Math.round(v.paquetes * 10000) / 10000;
      const am = amigable(v.base, v.unidadInsumo);
      return {
        articulo_id,
        articulo_nombre: artNombre.get(articulo_id) ?? "(artículo)",
        consumo_base: Math.round(am.v * 1000) / 1000,
        consumo_unidad: am.u,
        cantidad: paquetes,
        costo_promedio: cp,
        valor: Math.round(paquetes * cp * 100) / 100,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  return { desde, hasta, filas_leidas: consumo.filas_leidas, lineas, noLigados, problemas };
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
