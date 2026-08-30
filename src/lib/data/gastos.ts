// Capa de datos de GASTOS. Corre en el servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type GastoEstado = "borrador" | "confirmado" | "anulado";

export interface CuentaOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

/** Cuentas de GASTO (solo tipo gasto, no ingreso) para el selector de la pantalla de gastos. */
export async function listarCuentasSoloGasto(): Promise<CuentaOpcion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .eq("tipo", "gasto")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas de gasto: ${error.message}`);
  return (data ?? []) as CuentaOpcion[];
}

/** Cuentas para el selector "de dónde salió / contra qué queda": caja/banco y por pagar. */
export interface CuentasPagoGasto {
  pagado_con: CuentaOpcion[]; // caja / banco (activo)
  por_pagar: CuentaOpcion[]; // cuentas por pagar (pasivo)
}

export async function listarCuentasPagoGasto(): Promise<CuentasPagoGasto> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre, tipo")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .or("codigo.like.11-10-10-%,codigo.like.11-10-15-%,codigo.eq.21-10-01-00-00,codigo.eq.21-10-11-00-00")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas de pago: ${error.message}`);
  const rows = (data ?? []) as (CuentaOpcion & { tipo: string })[];
  // Se filtran las cuentas marcadas "No utilizar" en el catálogo.
  const usables = rows.filter((c) => !/no utilizar/i.test(c.nombre));
  return {
    pagado_con: usables.filter((c) => c.tipo === "activo").map(({ id, codigo, nombre }) => ({ id, codigo, nombre })),
    por_pagar: usables.filter((c) => c.tipo === "pasivo").map(({ id, codigo, nombre }) => ({ id, codigo, nombre })),
  };
}

export interface GastoListado {
  id: string;
  fecha: string;
  centro_codigo: string | null;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  descripcion: string | null;
  total: number;
  estado: GastoEstado;
}

export interface GastoFiltro {
  centro?: string; // centro_costo_id
  cuenta?: string; // cuenta_gasto_id
  estado?: string; // GastoEstado
  desde?: string;
  hasta?: string;
}

export interface OpcionCentroGasto {
  id: string;
  codigo: string;
}
export interface OpcionCuentaGasto {
  id: string;
  codigo: string;
  nombre: string;
}

// Centros que aparecen en los gastos, para el filtro.
export async function listarCentrosDeGastos(): Promise<OpcionCentroGasto[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("gastos").select("centro:centros_costo(id, codigo)");
  const map = new Map<string, string>();
  ((data ?? []) as unknown as { centro: { id: string; codigo: string } | null }[]).forEach((r) => {
    if (r.centro) map.set(r.centro.id, r.centro.codigo);
  });
  return [...map].map(([id, codigo]) => ({ id, codigo })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// Cuentas de gasto que aparecen en los gastos, para el filtro.
export async function listarCuentasDeGastos(): Promise<OpcionCuentaGasto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gastos")
    .select("cuenta:cuentas!gastos_cuenta_gasto_id_fkey(id, codigo, nombre)");
  const map = new Map<string, { codigo: string; nombre: string }>();
  ((data ?? []) as unknown as { cuenta: { id: string; codigo: string; nombre: string } | null }[]).forEach((r) => {
    if (r.cuenta) map.set(r.cuenta.id, { codigo: r.cuenta.codigo, nombre: r.cuenta.nombre });
  });
  return [...map]
    .map(([id, v]) => ({ id, codigo: v.codigo, nombre: v.nombre }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function listarGastos(filtro: GastoFiltro = {}): Promise<GastoListado[]> {
  const supabase = await createClient();
  let query = supabase
    .from("gastos")
    .select(
      "id, fecha, descripcion, total, estado, " +
        "centro:centros_costo(codigo), cuenta:cuentas!gastos_cuenta_gasto_id_fkey(codigo, nombre)",
    );
  if (filtro.centro) query = query.eq("centro_costo_id", filtro.centro);
  if (filtro.cuenta) query = query.eq("cuenta_gasto_id", filtro.cuenta);
  if (filtro.estado) query = query.eq("estado", filtro.estado as GastoEstado);
  if (filtro.desde) query = query.gte("fecha", filtro.desde);
  if (filtro.hasta) query = query.lte("fecha", filtro.hasta);
  const { data, error } = await query
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los gastos: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha: string;
    descripcion: string | null;
    total: number;
    estado: GastoEstado;
    centro: { codigo: string } | null;
    cuenta: { codigo: string; nombre: string } | null;
  }[]).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    centro_codigo: g.centro?.codigo ?? null,
    cuenta_codigo: g.cuenta?.codigo ?? null,
    cuenta_nombre: g.cuenta?.nombre ?? null,
    descripcion: g.descripcion,
    total: Number(g.total),
    estado: g.estado,
  }));
}

export interface GastoDetalle {
  id: string;
  fecha: string;
  centro_codigo: string | null;
  centro_nombre: string | null;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  pago_codigo: string | null;
  pago_nombre: string | null;
  proveedor_nombre: string | null;
  fecha_vencimiento: string | null;
  descripcion: string | null;
  subtotal: number;
  iva: number;
  total: number;
  estado: GastoEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
}

export interface GastoEditable {
  id: string;
  estado: GastoEstado;
  centro_costo_id: string;
  fecha: string;
  cuenta_gasto_id: string;
  cuenta_pago_id: string;
  proveedor_id: string | null;
  fecha_vencimiento: string | null;
  subtotal: number;
  iva: number;
  descripcion: string | null;
}

/** Campos crudos de un gasto, para precargar el formulario de edición. */
export async function obtenerGastoEditable(id: string): Promise<GastoEditable | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .select(
      "id, estado, centro_costo_id, fecha, cuenta_gasto_id, cuenta_pago_id, proveedor_id, fecha_vencimiento, subtotal, iva, descripcion",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el gasto: ${error.message}`);
  }
  const g = data as unknown as GastoEditable;
  return {
    ...g,
    subtotal: Number(g.subtotal),
    iva: Number(g.iva),
  };
}

export async function obtenerGasto(id: string): Promise<GastoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .select(
      "id, fecha, descripcion, subtotal, iva, total, estado, asiento_id, fecha_vencimiento, " +
        "centro:centros_costo(codigo, nombre), " +
        "cuenta:cuentas!gastos_cuenta_gasto_id_fkey(codigo, nombre), " +
        "pago:cuentas!gastos_cuenta_pago_id_fkey(codigo, nombre), " +
        "proveedor:proveedores(nombre), " +
        "asiento:asientos(numero)",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar el gasto: ${error.message}`);
  }
  const g = data as unknown as {
    id: string;
    fecha: string;
    descripcion: string | null;
    subtotal: number;
    iva: number;
    total: number;
    estado: GastoEstado;
    asiento_id: string | null;
    fecha_vencimiento: string | null;
    centro: { codigo: string; nombre: string } | null;
    cuenta: { codigo: string; nombre: string } | null;
    pago: { codigo: string; nombre: string } | null;
    proveedor: { nombre: string } | null;
    asiento: { numero: number | null } | null;
  };
  return {
    id: g.id,
    fecha: g.fecha,
    centro_codigo: g.centro?.codigo ?? null,
    centro_nombre: g.centro?.nombre ?? null,
    cuenta_codigo: g.cuenta?.codigo ?? null,
    cuenta_nombre: g.cuenta?.nombre ?? null,
    pago_codigo: g.pago?.codigo ?? null,
    pago_nombre: g.pago?.nombre ?? null,
    proveedor_nombre: g.proveedor?.nombre ?? null,
    fecha_vencimiento: g.fecha_vencimiento,
    descripcion: g.descripcion,
    subtotal: Number(g.subtotal),
    iva: Number(g.iva),
    total: Number(g.total),
    estado: g.estado,
    asiento_id: g.asiento_id,
    asiento_numero: g.asiento?.numero ?? null,
  };
}

export interface LineaEstadoCuenta {
  fecha: string;
  referencia: string | null;
  descripcion: string | null;
  debito: number;
  credito: number;
  conciliacion_id: string;
}

export interface MovimientoBancoDeAsiento {
  cuenta_codigo: string;
  cuenta_nombre: string;
  debito: number; // entró al banco
  credito: number; // salió del banco
  // Todas las líneas del estado de cuenta real con las que casó esta línea del
  // banco (puede ser N: un gasto cubierto por varias partidas del banco).
  lineas: LineaEstadoCuenta[];
}

// Movimiento(s) en cuentas de banco/caja del asiento de un gasto, con TODAS las
// líneas del estado de cuenta conciliadas (en orden). Permite, desde el gasto,
// ver "cuál fue ese gasto en el banco" y desglosar cada partida.
export async function bancoDeAsiento(asientoId: string): Promise<MovimientoBancoDeAsiento[]> {
  const supabase = await createClient();
  const { data: lineas } = await supabase
    .from("asientos_lineas")
    .select("id, debito, credito, cuenta:cuentas!inner(codigo, nombre)")
    .eq("asiento_id", asientoId);
  const filas = (lineas ?? []) as unknown as {
    id: string;
    debito: number;
    credito: number;
    cuenta: { codigo: string; nombre: string };
  }[];
  const banco = filas.filter((l) => /^11-10-(10|15)-/.test(l.cuenta.codigo));
  if (banco.length === 0) return [];

  const { data: matches } = await supabase
    .from("estado_cuenta_lineas")
    .select("asiento_linea_id, orden, fecha, referencia, descripcion, debito, credito, conciliacion_id")
    .in(
      "asiento_linea_id",
      banco.map((l) => l.id),
    )
    .order("fecha")
    .order("orden");
  const porLinea = new Map<string, LineaEstadoCuenta[]>();
  for (const m of (matches ?? []) as unknown as {
    asiento_linea_id: string;
    fecha: string;
    referencia: string | null;
    descripcion: string | null;
    debito: number;
    credito: number;
    conciliacion_id: string;
  }[]) {
    const arr = porLinea.get(m.asiento_linea_id) ?? [];
    arr.push({
      fecha: m.fecha,
      referencia: m.referencia,
      descripcion: m.descripcion,
      debito: Number(m.debito),
      credito: Number(m.credito),
      conciliacion_id: m.conciliacion_id,
    });
    porLinea.set(m.asiento_linea_id, arr);
  }

  return banco.map((l) => ({
    cuenta_codigo: l.cuenta.codigo,
    cuenta_nombre: l.cuenta.nombre,
    debito: Number(l.debito),
    credito: Number(l.credito),
    lineas: porLinea.get(l.id) ?? [],
  }));
}
