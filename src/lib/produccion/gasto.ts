// Port FIEL del cálculo "Gasto materia prima" de la app de producción de Chepito.
// Lógica pura (sin I/O): recibe los datos crudos y devuelve el consumo de insumos
// (materia prima) de un período, replicando exactamente:
//   - conversión de unidades, explosión de recetas anidadas,
//   - regla base/sábado/domingo de la familia baguette,
//   - clientes extra (cli_*) que cuentan todos los días,
//   - vínculo producto→receta (gasto_recetas) con auto-match por nombre.
// Verificado contra la app: agosto 2026 da los mismos kilos.
import { BASE_CATALOG } from "./catalogo";

export interface ProduccionRow {
  fecha: string;
  sucursal: string;
  fila: number;
  cantidad: number | string;
}
export interface Componente {
  tipoRef: "insumo" | "receta";
  refId: string;
  cantidad: number | string;
  unidad: string;
}
export interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  costo?: number;
  cantCompra?: number;
  proveedor?: string;
}
export interface Receta {
  id: string;
  rendCant: number | string;
  rendUnidad: string;
  componentes?: Componente[];
}
export interface Producto {
  id: string;
  nombre: string;
  componentes?: Componente[];
}
export interface CostosState {
  insumos: Insumo[];
  recetas: Receta[];
  productos: Producto[];
}
export type OverrideRow = {
  nombre?: string;
  codigo?: string;
  familia?: string;
  peso?: number;
  activo?: boolean;
};
export type GastoRecetas = Record<string, string>;

export interface ConsumoInsumo {
  insumo_id: string;
  nombre: string;
  unidad: string;
  base_qty: number; // en unidad base (g / ml / u)
  proveedor: string;
}
export interface ResultadoConsumo {
  insumos: ConsumoInsumo[];
  sin_receta: { fila: number; nombre: string; cantidad: number }[];
  filas_leidas: number;
}

// --- normalizadores (idénticos a la app) ---
const ACC: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
const norm = (s: unknown) => (s == null ? "" : String(s)).toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACC[c] || c).trim();
const normp = (s: unknown) => norm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singular = (s: unknown) => normp(s).split(" ").map((w) => (w.length > 3 ? w.replace(/e?s$/, "") : w)).join(" ");
const stripDia = (s: unknown) => (s == null ? "" : String(s)).replace(/\s+(sabado|s[áa]bado|domingo)$/i, "");

// --- unidades (idénticas) ---
const UNIDADES: Record<string, { familia: string; factor: number }> = {
  g: { familia: "peso", factor: 1 },
  kg: { familia: "peso", factor: 1000 },
  ml: { familia: "volumen", factor: 1 },
  L: { familia: "volumen", factor: 1000 },
  unidad: { familia: "conteo", factor: 1 },
  "porción": { familia: "conteo", factor: 1 },
};
const toBase = (cant: number | string, unidad: string) =>
  (parseFloat(String(cant)) || 0) * (UNIDADES[unidad] ? UNIDADES[unidad].factor : 1);

export function familiaBase(unidad: string): "peso" | "volumen" | "conteo" {
  const f = (UNIDADES[unidad] || {}).familia;
  return f === "peso" ? "peso" : f === "volumen" ? "volumen" : "conteo";
}

// Día de la semana del día calendario, independiente de la zona horaria del server
// (la app usa mediodía local; acá mediodía UTC → mismo día de la semana). 0=dom 6=sáb.
const dowOf = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

interface CatRow { fila: number; codigo: string; nombre: string; familia: string; peso: number; activo: boolean }

export function calcularConsumo(
  rows: ProduccionRow[],
  state: CostosState,
  gRec: GastoRecetas,
  overrides: Record<string, OverrideRow>,
  ini: string,
  fin: string,
  suc?: string,
): ResultadoConsumo {
  // --- catálogo (merge idéntico: override gana) ---
  const map: Record<number, CatRow> = {};
  BASE_CATALOG.forEach((c) => {
    map[c[0]] = { fila: c[0], codigo: c[1], nombre: c[2], familia: c[3] || "", peso: c[4], activo: true };
  });
  Object.keys(overrides).forEach((fs) => {
    const fila = Number(fs);
    const ov = overrides[fs];
    map[fila] = map[fila]
      ? { ...map[fila], ...ov, fila }
      : { fila, codigo: ov.codigo || "", nombre: ov.nombre || "", familia: ov.familia || "", peso: ov.peso || 0, activo: ov.activo !== false };
  });
  const effective = Object.values(map).filter((c) => c.activo !== false);
  const nombreFila: Record<number, string> = {};
  effective.forEach((c) => { nombreFila[c.fila] = c.nombre; });

  // variantPorFila
  const nombres = new Set(effective.map((c) => normp(c.nombre)));
  const vi: Record<number, { tipo: "base" | "sab" | "dom"; hasSab?: boolean; hasDom?: boolean }> = {};
  effective.forEach((c) => {
    const n = normp(c.nombre);
    const esBag = norm(c.familia) === "baguette";
    if (n.endsWith(" sabado")) vi[c.fila] = { tipo: "sab" };
    else if (n.endsWith(" domingo")) vi[c.fila] = { tipo: "dom" };
    else vi[c.fila] = { tipo: "base", hasSab: esBag || nombres.has(n + " sabado"), hasDom: esBag || nombres.has(n + " domingo") };
  });

  const getInsumo = (id: string) => state.insumos.find((x) => x.id === id);
  const getReceta = (id: string) => state.recetas.find((x) => x.id === id);
  const autoMatch = (nombre: string): Producto | null => {
    const prods = state.productos;
    if (!prods.length) return null;
    const base = stripDia(nombre);
    const cand = [normp(nombre), normp(base)];
    const candS = [singular(nombre), singular(base)];
    return prods.find((x) => cand.includes(normp(x.nombre))) || prods.find((x) => candS.includes(singular(x.nombre))) || null;
  };
  const prodForFila = (fila: number, nombre: string): Producto | null => {
    const ex = gRec[String(fila)];
    if (ex !== undefined) {
      if (ex === "__none__") return null;
      const p = state.productos.find((x) => x.id === ex);
      if (p) return p;
    }
    return autoMatch(nombre);
  };

  const accumInsumo = (tipoRef: string, refId: string, baseQty: number, acc: Record<string, number>, visiting: Set<string>) => {
    if (!(baseQty > 0)) return;
    if (tipoRef === "insumo") { acc[refId] = (acc[refId] || 0) + baseQty; return; }
    const rec = getReceta(refId);
    if (!rec || visiting.has(rec.id)) return;
    visiting.add(rec.id);
    const rendBase = toBase(rec.rendCant, rec.rendUnidad);
    if (rendBase > 0) {
      const f = baseQty / rendBase;
      (rec.componentes || []).forEach((c) => accumInsumo(c.tipoRef, c.refId, toBase(c.cantidad, c.unidad) * f, acc, visiting));
    }
    visiting.delete(rec.id);
  };
  const expandProducto = (prod: Producto, count: number, acc: Record<string, number>) =>
    (prod.componentes || []).forEach((c) => accumInsumo(c.tipoRef, c.refId, toBase(c.cantidad, c.unidad) * count, acc, new Set()));

  // --- unidades por fila en el rango (regla base/sáb/dom + clientes) ---
  const u: Record<number, number> = {};
  rows.forEach((r) => {
    if (suc && r.sucursal !== suc) return;
    const f = String(r.fecha).slice(0, 10);
    if (f < ini || f > fin) return;
    const q = Number(r.cantidad) || 0;
    if (!q) return;
    const esCli = typeof r.sucursal === "string" && r.sucursal.indexOf("cli_") === 0;
    const v = esCli ? null : vi[r.fila];
    const dow = dowOf(f);
    if (v) {
      if (v.tipo === "sab") { if (dow !== 6) return; }
      else if (v.tipo === "dom") { if (dow !== 0) return; }
      else if ((dow === 6 && v.hasSab) || (dow === 0 && v.hasDom)) return;
    }
    u[r.fila] = (u[r.fila] || 0) + q;
  });

  // --- consumo de insumos ---
  const acc: Record<string, number> = {};
  const sinReceta: { fila: number; nombre: string; cantidad: number }[] = [];
  Object.keys(u).forEach((fs) => {
    const fila = Number(fs);
    const count = u[fila] || 0;
    if (count <= 0) return;
    const nombre = nombreFila[fila] || "#" + fila;
    const prod = prodForFila(fila, nombre);
    if (!prod) { sinReceta.push({ fila, nombre, cantidad: count }); return; }
    expandProducto(prod, count, acc);
  });

  const insumos: ConsumoInsumo[] = Object.keys(acc)
    .map((id) => {
      const ins = getInsumo(id);
      return {
        insumo_id: id,
        nombre: ins ? ins.nombre : "?" + id,
        unidad: ins ? ins.unidad : "g",
        base_qty: acc[id],
        proveedor: (ins?.proveedor || "").trim(),
      };
    })
    .sort((a, b) => b.base_qty - a.base_qty);

  sinReceta.sort((a, b) => b.cantidad - a.cantidad);
  return { insumos, sin_receta: sinReceta, filas_leidas: rows.length };
}
