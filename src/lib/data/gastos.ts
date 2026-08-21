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

export async function listarGastos(): Promise<GastoListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .select(
      "id, fecha, descripcion, total, estado, " +
        "centro:centros_costo(codigo), cuenta:cuentas!gastos_cuenta_gasto_id_fkey(codigo, nombre)",
    )
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
