// Capa de datos de CONCILIACIONES bancarias. Corre en el servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConciliacionEstado = "borrador" | "conciliada" | "anulada";

export interface CuentaBanco {
  id: string;
  codigo: string;
  nombre: string;
}

// Cuentas de caja/banco (11-10) para conciliar, sin las marcadas "No utilizar".
export async function listarCuentasBanco(): Promise<CuentaBanco[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .or("codigo.like.11-10-10-%,codigo.like.11-10-15-%")
    .eq("acepta_movimiento", true)
    .eq("estado", "activo")
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar las cuentas: ${error.message}`);
  return (data ?? []).filter((c) => !/no utilizar/i.test(c.nombre));
}

export interface ConciliacionListado {
  id: string;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  fecha_corte: string;
  saldo_final: number;
  estado: ConciliacionEstado;
}

export async function listarConciliaciones(): Promise<ConciliacionListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conciliaciones_banco")
    .select("id, fecha_corte, saldo_final, estado, cuenta:cuentas(codigo, nombre)")
    .order("fecha_corte", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las conciliaciones: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    fecha_corte: string;
    saldo_final: number;
    estado: ConciliacionEstado;
    cuenta: { codigo: string; nombre: string } | null;
  }[]).map((c) => ({
    id: c.id,
    cuenta_codigo: c.cuenta?.codigo ?? null,
    cuenta_nombre: c.cuenta?.nombre ?? null,
    fecha_corte: c.fecha_corte,
    saldo_final: Number(c.saldo_final),
    estado: c.estado,
  }));
}

export interface LineaBanco {
  id: string;
  orden: number;
  fecha: string;
  referencia: string | null;
  codigo: string | null;
  descripcion: string | null;
  debito: number;
  credito: number;
  balance: number | null;
  estado: "pendiente" | "conciliada";
  asiento_linea_id: string | null;
  asiento_numero: number | null;
  asiento_id: string | null;
}

export interface MovimientoLibro {
  id: string; // asiento_linea id
  asiento_id: string;
  fecha: string;
  numero: number | null;
  tipo: string;
  glosa: string | null;
  debito: number;
  credito: number;
}

export interface ConciliacionDetalle {
  id: string;
  cuenta_id: string;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  fecha_corte: string;
  saldo_inicial: number;
  saldo_final: number;
  estado: ConciliacionEstado;
  lineas: LineaBanco[];
  movimientos_sin_conciliar: MovimientoLibro[]; // de libros, para emparejar
  saldo_libros: number; // saldo GL de la cuenta a la fecha de corte
}

export async function obtenerConciliacion(id: string): Promise<ConciliacionDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conciliaciones_banco")
    .select(
      "id, cuenta_id, fecha_corte, saldo_inicial, saldo_final, estado, " +
        "cuenta:cuentas(codigo, nombre), " +
        "lineas:estado_cuenta_lineas(id, orden, fecha, referencia, codigo, descripcion, debito, credito, balance, estado, asiento_linea_id, " +
        "al:asientos_lineas(asiento_id, asiento:asientos(numero)))",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`No se pudo cargar la conciliación: ${error.message}`);
  }
  const c = data as unknown as {
    id: string;
    cuenta_id: string;
    fecha_corte: string;
    saldo_inicial: number;
    saldo_final: number;
    estado: ConciliacionEstado;
    cuenta: { codigo: string; nombre: string } | null;
    lineas: {
      id: string;
      orden: number;
      fecha: string;
      referencia: string | null;
      codigo: string | null;
      descripcion: string | null;
      debito: number;
      credito: number;
      balance: number | null;
      estado: "pendiente" | "conciliada";
      asiento_linea_id: string | null;
      al: { asiento_id: string; asiento: { numero: number | null } | null } | null;
    }[];
  };

  const lineas: LineaBanco[] = (c.lineas ?? [])
    .map((l) => ({
      id: l.id,
      orden: l.orden,
      fecha: l.fecha,
      referencia: l.referencia,
      codigo: l.codigo,
      descripcion: l.descripcion,
      debito: Number(l.debito),
      credito: Number(l.credito),
      balance: l.balance == null ? null : Number(l.balance),
      estado: l.estado,
      asiento_linea_id: l.asiento_linea_id,
      asiento_numero: l.al?.asiento?.numero ?? null,
      asiento_id: l.al?.asiento_id ?? null,
    }))
    .sort((a, b) => a.orden - b.orden);

  // Movimientos de libros de la cuenta (confirmados, hasta la fecha de corte)
  // que todavía no casaron con ninguna línea del banco.
  //
  // Se EXCLUYEN las reversiones (tipo='reversion', las "ANULACIÓN de asiento…"):
  // corregir o eliminar un gasto anula el asiento original (queda 'anulado', ya
  // excluido) y postea una reversión. Mostrar la reversión sin su original
  // ensucia la conciliación e infla el saldo en libros. Al excluir ambos, la
  // conciliación refleja solo el asiento neto vigente: si el gasto se corrigió,
  // se ve el valor corregido; si se eliminó, no se ve nada.
  const { data: movsData } = await supabase
    .from("asientos_lineas")
    .select("id, debito, credito, asiento:asientos!inner(id, fecha, numero, tipo, glosa, estado)")
    .eq("cuenta_id", c.cuenta_id)
    .eq("asiento.estado", "confirmado")
    .neq("asiento.tipo", "reversion")
    .lte("asiento.fecha", c.fecha_corte);
  const movs = (movsData ?? []) as unknown as {
    id: string;
    debito: number;
    credito: number;
    asiento: { id: string; fecha: string; numero: number | null; tipo: string; glosa: string | null };
  }[];

  const { data: matchedData } = await supabase
    .from("estado_cuenta_lineas")
    .select("asiento_linea_id")
    .not("asiento_linea_id", "is", null);
  const matched = new Set((matchedData ?? []).map((m: { asiento_linea_id: string }) => m.asiento_linea_id));

  const movimientos_sin_conciliar: MovimientoLibro[] = movs
    .filter((m) => !matched.has(m.id))
    .map((m) => ({
      id: m.id,
      asiento_id: m.asiento.id,
      fecha: m.asiento.fecha,
      numero: m.asiento.numero,
      tipo: m.asiento.tipo,
      glosa: m.asiento.glosa,
      debito: Number(m.debito),
      credito: Number(m.credito),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const saldo_libros =
    movs.reduce((s, m) => s + Number(m.debito) - Number(m.credito), 0);

  return {
    id: c.id,
    cuenta_id: c.cuenta_id,
    cuenta_codigo: c.cuenta?.codigo ?? null,
    cuenta_nombre: c.cuenta?.nombre ?? null,
    fecha_corte: c.fecha_corte,
    saldo_inicial: Number(c.saldo_inicial),
    saldo_final: Number(c.saldo_final),
    estado: c.estado,
    lineas,
    movimientos_sin_conciliar,
    saldo_libros: Math.round(saldo_libros * 100) / 100,
  };
}
