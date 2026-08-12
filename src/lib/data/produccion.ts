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

export async function consumoMateriaPrima(ini: string, fin: string): Promise<ConsumoMateriaPrima> {
  const produccionDb = getProduccionDb();
  const [prod, cs, gr, ov] = await Promise.all([
    fetchProduccion(ini, fin),
    produccionDb.from("config").select("valor").eq("clave", "costos_state").maybeSingle(),
    produccionDb.from("config").select("valor").eq("clave", "gasto_recetas").maybeSingle(),
    produccionDb.from("catalogo_overrides").select("*"),
  ]);

  if (cs.error) throw new Error(`No se pudieron leer las recetas: ${cs.error.message}`);
  const csv = (cs.data?.valor ?? {}) as Partial<CostosState>;
  const state: CostosState = {
    insumos: csv.insumos ?? [],
    recetas: csv.recetas ?? [],
    productos: csv.productos ?? [],
  };
  const gRec = (gr.data?.valor ?? {}) as GastoRecetas;

  const overrides: Record<string, OverrideRow> = {};
  ((ov.data ?? []) as { fila: number | string; nombre?: string; codigo?: string; familia?: string; peso?: number; activo?: boolean }[])
    .forEach((r) => {
      overrides[String(r.fila)] = { nombre: r.nombre, codigo: r.codigo, familia: r.familia, peso: r.peso, activo: r.activo };
    });

  const res = calcularConsumo(prod, state, gRec, overrides, ini, fin);
  return { ...res, ini, fin };
}
