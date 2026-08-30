// Costo por PRODUCTO (por unidad) leído de la app de producción, para el desecho.
// Reusa la conexión (getProduccionDb), el catálogo base y los tipos existentes.
// Devuelve código→costo (por los "Vínculos" manuales) y nombre→costo (auto-match).
import "server-only";
import { getProduccionDb } from "@/lib/produccion/supabase";
import { createClient } from "@/lib/supabase/server";
import { BASE_CATALOG } from "@/lib/produccion/catalogo";
import type { CostosState, Insumo, Receta, Producto, Componente, GastoRecetas } from "@/lib/produccion/gasto";

const UNIDADES: Record<string, number> = { g: 1, kg: 1000, ml: 1, L: 1000, unidad: 1, "porción": 1 };
const toBase = (cant: number | string, unidad: string): number =>
  (parseFloat(String(cant)) || 0) * (UNIDADES[unidad] ?? 1);

export function normNombre(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RecetaOpcion {
  id: string;
  nombre: string;
  costo: number;
}
export interface CostosProduccion {
  porCodigo: Map<string, number>; // vía vínculos manuales (fila→producto)
  porNombre: Map<string, number>; // nombre normalizado → costo (auto-match)
  recetas: RecetaOpcion[]; // lista de productos costeados (para el selector manual)
  recetasOk: number;
  error?: string;
}

export async function obtenerCostos(): Promise<CostosProduccion> {
  let state: CostosState;
  let gRec: GastoRecetas;
  let overrides: { fila: number | string; codigo?: string; nombre?: string; activo?: boolean }[];
  try {
    const db = getProduccionDb();
    const [cs, gr, ov] = await Promise.all([
      db.from("config").select("valor").eq("clave", "costos_state").maybeSingle(),
      db.from("config").select("valor").eq("clave", "gasto_recetas").maybeSingle(),
      db.from("catalogo_overrides").select("fila,codigo,nombre,activo"),
    ]);
    if (cs.error) throw new Error(cs.error.message);
    const csv = (cs.data?.valor ?? {}) as Partial<CostosState>;
    state = { insumos: csv.insumos ?? [], recetas: csv.recetas ?? [], productos: csv.productos ?? [] };
    gRec = (gr.data?.valor ?? {}) as GastoRecetas;
    overrides = (ov.data ?? []) as { fila: number | string; codigo?: string; nombre?: string; activo?: boolean }[];
  } catch (e) {
    return {
      porCodigo: new Map(),
      porNombre: new Map(),
      recetas: [],
      recetasOk: 0,
      error: `No se pudieron leer los costos de la app de producción: ${e instanceof Error ? e.message : "error"}`,
    };
  }

  const insumos = new Map(state.insumos.map((i) => [i.id, i]));
  const recetas = new Map(state.recetas.map((r) => [r.id, r]));
  const productos = new Map(state.productos.map((p) => [p.id, p]));

  const costoBaseInsumo = (i: Insumo): number => {
    const b = toBase(i.cantCompra ?? 0, i.unidad);
    return b > 0 ? Number(i.costo ?? 0) / b : Infinity;
  };
  const costoReceta = (r: Receta, vis: Set<string>): number => {
    if (vis.has(r.id)) throw new Error("circular");
    vis.add(r.id);
    let t = 0;
    for (const c of r.componentes ?? []) t += costoLinea(c, vis);
    vis.delete(r.id);
    return t;
  };
  const costoBaseReceta = (r: Receta, vis: Set<string>): number => {
    const b = toBase(r.rendCant, r.rendUnidad);
    return b > 0 ? costoReceta(r, vis) / b : Infinity;
  };
  function costoLinea(c: Componente, vis: Set<string>): number {
    let base = 0;
    if (c.tipoRef === "insumo") {
      const it = insumos.get(c.refId);
      base = it ? costoBaseInsumo(it) : 0;
    } else {
      const it = recetas.get(c.refId);
      base = it ? costoBaseReceta(it, vis) : 0;
    }
    return toBase(c.cantidad, c.unidad) * base;
  }
  const costoProducto = (p: Producto): number => {
    let t = 0;
    for (const c of p.componentes ?? []) t += costoLinea(c, new Set());
    return t;
  };

  const porNombre = new Map<string, number>();
  let recetasOk = 0;
  for (const p of productos.values()) {
    try {
      const c = costoProducto(p);
      if (isFinite(c) && c > 0) {
        porNombre.set(normNombre(p.nombre), c);
        recetasOk++;
      }
    } catch {
      /* receta circular: se ignora */
    }
  }

  // --- código → costo, replicando el match de la app de producción ---
  // Cada FILA del catálogo tiene un código y un nombre de PRODUCCIÓN (que puede
  // diferir del de QuPOS). La receta se toma del vínculo manual (gasto_recetas)
  // o por auto-match del nombre de producción. Así "MANITA Q" (QuPOS) toma la
  // receta ligada a "Manita con queso" (producción).
  const ACC: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
  const norm = (s: unknown) => (s == null ? "" : String(s)).toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACC[c] || c).trim();
  const normp = (s: unknown) => norm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const singular = (s: unknown) => normp(s).split(" ").map((w) => (w.length > 3 ? w.replace(/e?s$/, "") : w)).join(" ");
  const stripDia = (s: unknown) => (s == null ? "" : String(s)).replace(/\s+(sabado|s[áa]bado|domingo)$/i, "");
  const prodList = state.productos;
  const autoMatch = (nombre: string): Producto | null => {
    if (!prodList.length) return null;
    const base = stripDia(nombre);
    const cand = [normp(nombre), normp(base)];
    const candS = [singular(nombre), singular(base)];
    return prodList.find((x) => cand.includes(normp(x.nombre))) || prodList.find((x) => candS.includes(singular(x.nombre))) || null;
  };

  // Merge del catálogo (BASE_CATALOG + overrides, override gana) → fila→{codigo,nombre,activo}
  const cat = new Map<number, { codigo: string; nombre: string; activo: boolean }>();
  for (const c of BASE_CATALOG) cat.set(c[0], { codigo: c[1] || "", nombre: c[2] || "", activo: true });
  for (const o of overrides) {
    const fila = Number(o.fila);
    const prev = cat.get(fila) ?? { codigo: "", nombre: "", activo: true };
    cat.set(fila, {
      codigo: o.codigo ?? prev.codigo,
      nombre: o.nombre ?? prev.nombre,
      activo: o.activo !== false,
    });
  }

  const porCodigo = new Map<string, number>();
  for (const [fila, info] of cat) {
    if (!info.activo || !info.codigo) continue;
    const manual = (gRec ?? {})[String(fila)];
    let p: Producto | null | undefined;
    if (manual !== undefined) p = manual === "__none__" ? null : productos.get(manual) ?? null;
    else p = autoMatch(info.nombre);
    if (!p) continue;
    try {
      const c = costoProducto(p);
      if (isFinite(c) && c > 0) porCodigo.set(info.codigo, c);
    } catch {
      /* ignore */
    }
  }

  // Vínculos MANUALES del ERP (el usuario ligó código → receta): mandan sobre todo.
  try {
    const erp = await createClient();
    const { data: vinc } = await erp.from("costo_producto_vinculo").select("codigo, producto_id");
    for (const v of (vinc ?? []) as { codigo: string; producto_id: string }[]) {
      const p = productos.get(v.producto_id);
      if (!p) continue;
      try {
        const c = costoProducto(p);
        if (isFinite(c) && c > 0) porCodigo.set(v.codigo, c);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* si falla la lectura de vínculos, seguimos con el auto-match */
  }

  // Lista de recetas costeadas (para el selector manual), ordenada por nombre.
  const recetasOpts: RecetaOpcion[] = [];
  for (const p of productos.values()) {
    try {
      const c = costoProducto(p);
      if (isFinite(c) && c > 0) recetasOpts.push({ id: p.id, nombre: p.nombre, costo: Math.round(c * 100) / 100 });
    } catch {
      /* ignore */
    }
  }
  recetasOpts.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

  return { porCodigo, porNombre, recetas: recetasOpts, recetasOk };
}
