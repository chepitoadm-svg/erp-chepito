// Capa de datos de PLANILLA. Corre en el servidor.
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PlanillaEstado = "borrador" | "confirmada" | "anulada" | "descartada";
export type Destino = "TAL" | "CH1" | "CH2" | "DIV" | "CAS";

export interface PlanillaListado {
  id: string;
  titulo: string | null;
  fecha: string;
  quincena: number | null;
  estado: PlanillaEstado;
  n_colaboradores: number;
  neto: number;
  pagado: number;
  saldo: number;
  posteada: boolean;
  pagada: boolean;
}

export interface PlanillaLinea {
  id: string;
  clave: string | null;
  cedula: string | null;
  nombre: string | null;
  puesto: string | null;
  tiene_ccss: boolean;
  destino: Destino;
  salario_base: number;
  ccss_obrero: number;
  cargas_patronal: number;
  pago_adicional: number;
  adelanto: number;
}

export interface PlanillaPago {
  id: string;
  fecha: string;
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;
  monto: number;
  asiento_id: string | null;
  asiento_numero: number | null;
  estado: "confirmado" | "anulado";
}

export interface PlanillaDetalle {
  id: string;
  titulo: string | null;
  fecha: string;
  quincena: number | null;
  reparto_ch1: number;
  estado: PlanillaEstado;
  asiento_id: string | null;
  asiento_numero: number | null;
  adelanto_asiento_id: string | null;
  adelanto_asiento_numero: number | null;
  adelanto_total: number;
  neto_total: number;
  pagado: number;
  saldo: number;
  pagos: PlanillaPago[];
  lineas: PlanillaLinea[];
}

const netoDe = (l: { salario_base: number; pago_adicional: number; ccss_obrero: number; adelanto: number }) =>
  Number(l.salario_base) + Number(l.pago_adicional) - Number(l.ccss_obrero) - Number(l.adelanto);

export async function listarPlanillas(): Promise<PlanillaListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planilla")
    .select(
      "id, titulo, fecha, quincena, estado, asiento_id, " +
        "lineas:planilla_lineas(salario_base, pago_adicional, ccss_obrero, adelanto), " +
        "pagos:planilla_pagos(monto, estado)",
    )
    .neq("estado", "descartada")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las planillas: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    titulo: string | null;
    fecha: string;
    quincena: number | null;
    estado: PlanillaEstado;
    asiento_id: string | null;
    lineas: { salario_base: number; pago_adicional: number; ccss_obrero: number; adelanto: number }[];
    pagos: { monto: number; estado: string }[];
  }[]).map((p) => {
    const neto = Math.round((p.lineas ?? []).reduce((s, l) => s + netoDe(l), 0) * 100) / 100;
    const pagado =
      Math.round((p.pagos ?? []).filter((x) => x.estado === "confirmado").reduce((s, x) => s + Number(x.monto), 0) * 100) /
      100;
    const saldo = Math.round((neto - pagado) * 100) / 100;
    return {
      id: p.id,
      titulo: p.titulo,
      fecha: p.fecha,
      quincena: p.quincena,
      estado: p.estado,
      n_colaboradores: (p.lineas ?? []).filter((l) => Number(l.salario_base) > 0 || Number(l.pago_adicional) > 0).length,
      neto,
      pagado,
      saldo,
      posteada: !!p.asiento_id,
      pagada: !!p.asiento_id && saldo <= 0.005,
    };
  });
}

export async function obtenerPlanilla(id: string): Promise<PlanillaDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planilla")
    .select(
      "id, titulo, fecha, quincena, reparto_ch1, estado, asiento_id, adelanto_asiento_id, " +
        "asiento:asientos!planilla_asiento_id_fkey(numero), " +
        "adasiento:asientos!planilla_adelanto_asiento_id_fkey(numero), " +
        "lineas:planilla_lineas(id, clave, cedula, nombre, puesto, tiene_ccss, destino, salario_base, ccss_obrero, cargas_patronal, pago_adicional, adelanto), " +
        "pagos:planilla_pagos(id, fecha, monto, estado, asiento_id, cuenta:cuentas(codigo, nombre), asiento:asientos(numero))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la planilla: ${error.message}`);
  if (!data) return null;
  const one = <T>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  const p = data as unknown as {
    id: string;
    titulo: string | null;
    fecha: string;
    quincena: number | null;
    reparto_ch1: number;
    estado: PlanillaEstado;
    asiento_id: string | null;
    adelanto_asiento_id: string | null;
    asiento: { numero: number | null } | { numero: number | null }[] | null;
    adasiento: { numero: number | null } | { numero: number | null }[] | null;
    lineas: PlanillaLinea[];
    pagos: {
      id: string;
      fecha: string;
      monto: number;
      estado: "confirmado" | "anulado";
      asiento_id: string | null;
      cuenta: { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null;
      asiento: { numero: number | null } | { numero: number | null }[] | null;
    }[];
  };
  const lineas = (p.lineas ?? []).map((l) => ({
    ...l,
    salario_base: Number(l.salario_base),
    ccss_obrero: Number(l.ccss_obrero),
    cargas_patronal: Number(l.cargas_patronal),
    pago_adicional: Number(l.pago_adicional),
    adelanto: Number(l.adelanto),
  }));
  const neto_total = Math.round(lineas.reduce((s, l) => s + netoDe(l), 0) * 100) / 100;
  const adelanto_total = Math.round(lineas.reduce((s, l) => s + l.adelanto, 0) * 100) / 100;
  const pagos: PlanillaPago[] = (p.pagos ?? [])
    .map((x) => {
      const cta = one(x.cuenta);
      return {
        id: x.id,
        fecha: x.fecha,
        cuenta_codigo: cta?.codigo ?? null,
        cuenta_nombre: cta?.nombre ?? null,
        monto: Number(x.monto),
        asiento_id: x.asiento_id,
        asiento_numero: one(x.asiento)?.numero ?? null,
        estado: x.estado,
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pagado = Math.round(pagos.filter((x) => x.estado === "confirmado").reduce((s, x) => s + x.monto, 0) * 100) / 100;
  const saldo = Math.round((neto_total - pagado) * 100) / 100;
  return {
    id: p.id,
    titulo: p.titulo,
    fecha: p.fecha,
    quincena: p.quincena,
    reparto_ch1: Number(p.reparto_ch1),
    estado: p.estado,
    asiento_id: p.asiento_id,
    asiento_numero: one(p.asiento)?.numero ?? null,
    adelanto_asiento_id: p.adelanto_asiento_id,
    adelanto_asiento_numero: one(p.adasiento)?.numero ?? null,
    adelanto_total,
    neto_total,
    pagado,
    saldo,
    pagos,
    lineas,
  };
}

export interface BancoOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

// Cuentas de banco/caja para pagar la planilla.
export async function listarBancos(): Promise<BancoOpcion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("id, codigo, nombre")
    .like("codigo", "11-10-%")
    .eq("acepta_movimiento", true)
    .order("codigo");
  if (error) throw new Error(`No se pudieron cargar los bancos: ${error.message}`);
  return (data ?? []) as BancoOpcion[];
}
