// Costo de ventas del mes: lee el consumo de MP del app de producción por
// sucursal, lo valoriza con las recetas y lo agrupa por centro de costo del ERP.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProduccionDb } from "@/lib/produccion/supabase";
import {
  calcularConsumo,
  costoDeConsumo,
  type CostosState,
  type GastoRecetas,
  type OverrideRow,
  type ProduccionRow,
} from "@/lib/produccion/gasto";

// Mapeo sucursal (app producción) → código de centro de costo (ERP).
function centroDeSucursal(sucursal: string): "CH1" | "CH2" | "VEX" | null {
  if (sucursal === "chepito1") return "CH1";
  if (sucursal === "chepito2") return "CH2";
  if (sucursal.startsWith("cli_")) return "VEX"; // clientes de mayoreo
  return null;
}

const ultimoDiaMes = (periodo: string) => {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export interface CostoCentro {
  centro_id: string;
  centro_codigo: string;
  centro_nombre: string;
  monto: number;
  sin_receta: number; // unidades producidas sin receta (no costeadas)
}

export interface CostoProduccionCalculo {
  periodo: string; // YYYY-MM
  ini: string;
  fin: string;
  centros: CostoCentro[];
  total: number;
  sin_mapear: { sucursal: string; monto: number }[]; // sucursales que no calzan con un centro
  filas: number;
}

export async function calcularCostoProduccionMes(periodo: string): Promise<CostoProduccionCalculo> {
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error("Mes inválido (usá YYYY-MM).");
  const ini = `${periodo}-01`;
  const fin = ultimoDiaMes(periodo);

  const produccionDb = getProduccionDb();
  // Producción del mes (paginado).
  let rows: ProduccionRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await produccionDb
      .from("produccion")
      .select("fecha,sucursal,fila,cantidad")
      .gte("fecha", ini)
      .lte("fecha", fin)
      .range(from, from + 999);
    if (error) throw new Error(`No se pudo leer producción: ${error.message}`);
    rows = rows.concat((data ?? []) as ProduccionRow[]);
    if (!data || data.length < 1000) break;
  }

  const [cs, gr, ov] = await Promise.all([
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
  ((ov.data ?? []) as { fila: number | string; nombre?: string; codigo?: string; familia?: string; peso?: number; activo?: boolean }[]).forEach(
    (r) => {
      overrides[String(r.fila)] = { nombre: r.nombre, codigo: r.codigo, familia: r.familia, peso: r.peso, activo: r.activo };
    },
  );

  // Centros del ERP por código.
  const supabase = await createClient();
  const { data: centrosData, error: cErr } = await supabase
    .from("centros_costo")
    .select("id, codigo, nombre")
    .in("codigo", ["CH1", "CH2", "VEX"]);
  if (cErr) throw new Error(`No se pudieron cargar los centros: ${cErr.message}`);
  const centroPorCodigo = new Map(
    (centrosData ?? []).map((c) => [c.codigo, c as { id: string; codigo: string; nombre: string }]),
  );

  // Consumo valorizado por sucursal (una corrida por sucursal para respetar la
  // regla base/sábado/domingo y los clientes cli_*).
  const sucursales = [...new Set(rows.map((r) => r.sucursal))];
  const acumCentro = new Map<string, { monto: number; sin_receta: number }>();
  const sinMapear: { sucursal: string; monto: number }[] = [];

  for (const suc of sucursales) {
    const res = calcularConsumo(rows, state, gRec, overrides, ini, fin, suc);
    const monto = costoDeConsumo(res, state.insumos);
    const sinReceta = res.sin_receta.reduce((s, x) => s + x.cantidad, 0);
    if (monto <= 0 && sinReceta === 0) continue;
    const cod = centroDeSucursal(suc);
    if (!cod) {
      if (monto > 0) sinMapear.push({ sucursal: suc, monto: Math.round(monto * 100) / 100 });
      continue;
    }
    const prev = acumCentro.get(cod) ?? { monto: 0, sin_receta: 0 };
    acumCentro.set(cod, { monto: prev.monto + monto, sin_receta: prev.sin_receta + sinReceta });
  }

  const centros: CostoCentro[] = [];
  for (const [cod, v] of acumCentro) {
    const centro = centroPorCodigo.get(cod);
    if (!centro) continue;
    centros.push({
      centro_id: centro.id,
      centro_codigo: centro.codigo,
      centro_nombre: centro.nombre,
      monto: Math.round(v.monto * 100) / 100,
      sin_receta: Math.round(v.sin_receta * 100) / 100,
    });
  }
  centros.sort((a, b) => a.centro_codigo.localeCompare(b.centro_codigo));
  const total = Math.round(centros.reduce((s, c) => s + c.monto, 0) * 100) / 100;

  return { periodo, ini, fin, centros, total, sin_mapear: sinMapear, filas: rows.length };
}

// MP comprada del mes: suma de las líneas de factura de compra (confirmadas, de
// inventario) cuyos artículos son materia prima, en el rango del mes.
export async function mpCompradaMes(ini: string, fin: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facturas_compra_lineas")
    .select(
      "base_imponible, factura:facturas_compra!inner(estado, tipo, fecha_emision), articulo:articulos!inner(tipo)",
    )
    .eq("factura.estado", "confirmada")
    .eq("factura.tipo", "inventario")
    .eq("articulo.tipo", "materia_prima")
    .gte("factura.fecha_emision", ini)
    .lte("factura.fecha_emision", fin);
  if (error) throw new Error(`No se pudo sumar la MP comprada: ${error.message}`);
  const total = ((data ?? []) as { base_imponible: number }[]).reduce((s, l) => s + Number(l.base_imponible ?? 0), 0);
  return Math.round(total * 100) / 100;
}

export interface CierreCentro {
  centro_id: string;
  centro_codigo: string;
  centro_nombre: string;
  consumo_teorico: number; // costo por recetas (base de reparto)
  monto: number; // MP comprada prorrateada (el costo real de la panadería)
  sin_receta: number;
}

export interface CierreMp {
  periodo: string;
  ini: string;
  fin: string;
  centros: CierreCentro[];
  mp_comprada: number; // total comprado (= suma de montos prorrateados)
  consumo_teorico_total: number;
  variacion: number; // comprado − consumido teórico (la alarma)
  sin_mapear: { sucursal: string; monto: number }[];
}

// Cierre de MP del mes: reparte la MP comprada real a cada panadería según su
// participación en el consumo teórico, y calcula la variación de control.
export async function cierreMpMes(periodo: string): Promise<CierreMp> {
  const calc = await calcularCostoProduccionMes(periodo); // centros con monto = consumo teórico
  const mp = await mpCompradaMes(calc.ini, calc.fin);
  const totalTeorico = calc.total;

  // Prorrateo con la regla de redondeo: las primeras n−1 se redondean y la
  // última absorbe el residuo, para que la suma cuadre exacto con lo comprado.
  const centros: CierreCentro[] = [];
  let acumulado = 0;
  calc.centros.forEach((c, i) => {
    const esUltima = i === calc.centros.length - 1;
    const share = totalTeorico > 0 ? c.monto / totalTeorico : 0;
    const prorrateado = esUltima
      ? Math.round((mp - acumulado) * 100) / 100
      : Math.round(mp * share * 100) / 100;
    acumulado += prorrateado;
    centros.push({
      centro_id: c.centro_id,
      centro_codigo: c.centro_codigo,
      centro_nombre: c.centro_nombre,
      consumo_teorico: c.monto,
      monto: prorrateado,
      sin_receta: c.sin_receta,
    });
  });

  return {
    periodo,
    ini: calc.ini,
    fin: calc.fin,
    centros,
    mp_comprada: mp,
    consumo_teorico_total: totalTeorico,
    variacion: Math.round((mp - totalTeorico) * 100) / 100,
    sin_mapear: calc.sin_mapear,
  };
}

// === Listado / detalle desde el ERP ==========================================
export type CostoMesEstado = "borrador" | "confirmado" | "anulado";

export interface CostoMesListado {
  id: string;
  periodo: string;
  total: number;
  estado: CostoMesEstado;
}

export async function listarCostosMes(): Promise<CostoMesListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("costo_produccion_mes")
    .select("id, periodo, total, estado")
    .order("periodo", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los costos: ${error.message}`);
  return ((data ?? []) as { id: string; periodo: string; total: number; estado: CostoMesEstado }[]).map((r) => ({
    id: r.id,
    periodo: r.periodo,
    total: Number(r.total),
    estado: r.estado,
  }));
}

export interface CostoMesDetalle {
  id: string;
  periodo: string;
  total: number; // MP comprada prorrateada
  consumo_teorico: number;
  estado: CostoMesEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
  lineas: {
    centro_codigo: string | null;
    centro_nombre: string | null;
    monto: number;
    consumo_teorico: number;
    sin_receta: number;
  }[];
}

export async function obtenerCostoMes(id: string): Promise<CostoMesDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("costo_produccion_mes")
    .select(
      "id, periodo, total, consumo_teorico, estado, asiento_id, asiento:asientos(numero), " +
        "lineas:costo_produccion_mes_lineas(monto, consumo_teorico, unidades_sin_receta, centro:centros_costo(codigo, nombre))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el costo: ${error.message}`);
  }
  const r = data as unknown as {
    id: string;
    periodo: string;
    total: number;
    consumo_teorico: number;
    estado: CostoMesEstado;
    asiento_id: string | null;
    asiento: { numero: number | null } | null;
    lineas: { monto: number; consumo_teorico: number; unidades_sin_receta: number; centro: { codigo: string; nombre: string } | null }[];
  };
  return {
    id: r.id,
    periodo: r.periodo,
    total: Number(r.total),
    consumo_teorico: Number(r.consumo_teorico),
    estado: r.estado,
    asiento_id: r.asiento_id,
    asiento_numero: r.asiento?.numero ?? null,
    lineas: (r.lineas ?? [])
      .map((l) => ({
        centro_codigo: l.centro?.codigo ?? null,
        centro_nombre: l.centro?.nombre ?? null,
        monto: Number(l.monto),
        consumo_teorico: Number(l.consumo_teorico),
        sin_receta: Number(l.unidades_sin_receta),
      }))
      .sort((a, b) => (a.centro_codigo ?? "").localeCompare(b.centro_codigo ?? "")),
  };
}
