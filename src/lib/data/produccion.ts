// Capa de datos de PRODUCCIÓN (solo lectura del Supabase de la app de producción).
// Calcula el consumo de materia prima de un período replicando el "Gasto materia
// prima" de la app, para el inventario perpetuo del ERP.
import "server-only";
import { getProduccionDb } from "@/lib/produccion/supabase";
import {
  calcularConsumo,
  type CostosState,
  type GastoRecetas,
  type OverrideRow,
  type ProduccionRow,
  type ResultadoConsumo,
} from "@/lib/produccion/gasto";

async function fetchProduccion(ini: string, fin: string): Promise<ProduccionRow[]> {
  const produccionDb = getProduccionDb();
  const page = 1000;
  let from = 0;
  let all: ProduccionRow[] = [];
  // Paginado, igual que la app.
  for (;;) {
    const { data, error } = await produccionDb
      .from("produccion")
      .select("fecha,sucursal,fila,cantidad")
      .gte("fecha", ini)
      .lte("fecha", fin)
      .range(from, from + page - 1);
    if (error) throw new Error(`No se pudo leer producción: ${error.message}`);
    all = all.concat((data ?? []) as ProduccionRow[]);
    if (!data || data.length < page) break;
    from += page;
  }
  return all;
}

export interface ConsumoMateriaPrima extends ResultadoConsumo {
  ini: string;
  fin: string;
}

interface ClienteExtra { id: string; nombre: string; activo?: boolean }

// Lee UNA sola vez todo lo necesario (producción + recetas + overrides + clientes).
async function cargarBase(ini: string, fin: string) {
  const produccionDb = getProduccionDb();
  const [prod, cs, gr, ov, ce] = await Promise.all([
    fetchProduccion(ini, fin),
    produccionDb.from("config").select("valor").eq("clave", "costos_state").maybeSingle(),
    produccionDb.from("config").select("valor").eq("clave", "gasto_recetas").maybeSingle(),
    produccionDb.from("catalogo_overrides").select("*"),
    produccionDb.from("config").select("valor").eq("clave", "clientes_extra").maybeSingle(),
  ]);
  if (cs.error) throw new Error(`No se pudieron leer las recetas: ${cs.error.message}`);
  const csv = (cs.data?.valor ?? {}) as Partial<CostosState>;
  const state: CostosState = { insumos: csv.insumos ?? [], recetas: csv.recetas ?? [], productos: csv.productos ?? [] };
  const gRec = (gr.data?.valor ?? {}) as GastoRecetas;
  const overrides: Record<string, OverrideRow> = {};
  ((ov.data ?? []) as { fila: number | string; nombre?: string; codigo?: string; familia?: string; peso?: number; activo?: boolean }[])
    .forEach((r) => { overrides[String(r.fila)] = { nombre: r.nombre, codigo: r.codigo, familia: r.familia, peso: r.peso, activo: r.activo }; });
  const clientes = (Array.isArray(ce.data?.valor) ? ce.data.valor : []) as ClienteExtra[];
  return { prod, state, gRec, overrides, clientes };
}

export async function consumoMateriaPrima(ini: string, fin: string): Promise<ConsumoMateriaPrima> {
  const { prod, state, gRec, overrides } = await cargarBase(ini, fin);
  const res = calcularConsumo(prod, state, gRec, overrides, ini, fin);
  return { ...res, ini, fin };
}

export interface GastoCard { key: string; label: string; total_colones: number; unidades: number }
export interface GastoCompleto {
  ini: string;
  fin: string;
  cards: GastoCard[];
  detalle: ResultadoConsumo;
  suc: string | null;
  sucLabel: string;
}

// Gasto del período con desglose por sucursal/cliente (como la app) + detalle de
// la sucursal elegida (o de todas). Una sola lectura; filtra en memoria por suc.
export async function gastoCompleto(ini: string, fin: string, suc?: string): Promise<GastoCompleto> {
  const { prod, state, gRec, overrides, clientes } = await cargarBase(ini, fin);
  const calc = (s?: string) => calcularConsumo(prod, state, gRec, overrides, ini, fin, s);
  const unidadesDe = (r: ResultadoConsumo) =>
    r.por_producto.reduce((a, p) => a + p.unidades, 0) + r.sin_receta.reduce((a, s) => a + s.cantidad, 0);

  const todos = calc(undefined);
  const cards: GastoCard[] = [{ key: "todos", label: "Todas", total_colones: todos.total_colones, unidades: unidadesDe(todos) }];
  for (const [key, label] of [["chepito1", "Chepito 1"], ["chepito2", "Chepito 2"]] as const) {
    const r = calc(key);
    cards.push({ key, label, total_colones: r.total_colones, unidades: unidadesDe(r) });
  }
  const nombreCli = new Map(clientes.map((c) => [c.id, c.nombre]));
  const cliIds = Array.from(new Set(prod.map((r) => String(r.sucursal)).filter((s) => s.startsWith("cli_"))));
  for (const id of cliIds) {
    const r = calc(id);
    const u = unidadesDe(r);
    if (u > 0 || r.total_colones > 0) cards.push({ key: id, label: nombreCli.get(id) || "Cliente", total_colones: r.total_colones, unidades: u });
  }
  cards.sort((a, b) => (a.key === "todos" ? -1 : b.key === "todos" ? 1 : b.total_colones - a.total_colones));

  const sel = suc && suc !== "todos" ? suc : undefined;
  const detalle = sel ? calc(sel) : todos;
  const sucLabel = !sel
    ? "Todas las sucursales"
    : sel === "chepito1" ? "Chepito 1" : sel === "chepito2" ? "Chepito 2" : nombreCli.get(sel) || "Cliente";
  return { ini, fin, cards, detalle, suc: sel ?? null, sucLabel };
}
