"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPermiso } from "@/lib/auth/permisos";
import type { Destino } from "@/lib/data/planilla";

export interface LineaPlanilla {
  clave: string;
  cedula: string | null;
  nombre: string;
  puesto: string;
  tiene_ccss: boolean;
  destino: Destino;
  salario_base: number;
  ccss_obrero: number;
  cargas_patronal: number;
  pago_adicional: number;
  adelanto: number;
}

export interface PlanillaAnalisis {
  error?: string;
  titulo?: string;
  fecha?: string;
  quincena?: number;
  lineas?: LineaPlanilla[];
}

// ---------- parseo ----------
const parseCRC = (s: string): number => {
  if (s == null) return 0;
  let t = String(s).replace(/[₡\s  ]/g, "").trim();
  if (t === "" || t === "—" || t === "-") return 0;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/[.,]/g, "");
  const n = Number(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
};

const normNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const claveDe = (cedula: string, nombre: string) => {
  const c = cedula.replace(/\D/g, "");
  return c || normNombre(nombre);
};

const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", setiembre: "09", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

export async function analizarPlanilla(_prev: PlanillaAnalisis, formData: FormData): Promise<PlanillaAnalisis> {
  await requerirPermiso("gastos.registrar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Subí el CSV de la planilla." };

  let texto: string;
  try {
    texto = await archivo.text();
  } catch {
    return { error: "No se pudo leer el archivo." };
  }
  const lineas = texto.split(/\r?\n/);
  const filas = lineas.map(parseCsvLine);

  // Título (primera celda no vacía) → quincena + fecha.
  const tituloRaw = filas.find((f) => f[0] && f[0].length > 3)?.[0] ?? "";
  const titulo = tituloRaw.replace(/^.*—\s*/, "").trim() || tituloRaw.trim();
  const low = tituloRaw.toLowerCase();
  const quincena = /2\s*da|2a|segunda/.test(low) ? 2 : /1\s*ra|1a|primera/.test(low) ? 1 : undefined;
  let fecha = "";
  const mesK = Object.keys(MESES).find((m) => low.includes(m));
  const anio = low.match(/20\d{2}/)?.[0];
  if (mesK && anio) {
    const mm = MESES[mesK];
    if (quincena === 2) {
      const ult = new Date(Number(anio), Number(mm), 0).getDate();
      fecha = `${anio}-${mm}-${String(ult).padStart(2, "0")}`;
    } else fecha = `${anio}-${mm}-15`;
  }

  // Encabezado de la tabla.
  const hIdx = filas.findIndex((f) => f.some((c) => /emplead/i.test(c)));
  if (hIdx < 0) return { error: "No encontré el encabezado (columna 'Empleada') en el CSV." };
  const head = filas[hIdx].map((c) => c.toLowerCase());
  const col = (...kw: string[]) => head.findIndex((h) => kw.every((k) => h.includes(k)));
  const iNombre = col("emplead");
  const iCedula = col("dula");
  const iPuesto = col("puesto");
  const iBase = col("pago", "base");
  const iCcss = col("deduccion", "ccss") >= 0 ? col("deduccion", "ccss") : col("ccss");
  const iAdelanto = head.findIndex((h) => h === "adelanto");
  const iAdic = col("pago", "adicional");
  const iCargas = col("cargas");

  const out: LineaPlanilla[] = [];
  for (let r = hIdx + 1; r < filas.length; r++) {
    const f = filas[r];
    const nombre = (f[iNombre] ?? "").trim();
    if (!nombre || /^totales$/i.test(nombre)) continue;
    const cedula = iCedula >= 0 ? (f[iCedula] ?? "").trim() : "";
    const ccss = iCcss >= 0 ? parseCRC(f[iCcss]) : 0;
    const cargas = iCargas >= 0 ? parseCRC(f[iCargas]) : 0;
    out.push({
      clave: claveDe(cedula, nombre),
      cedula: cedula || null,
      nombre,
      puesto: iPuesto >= 0 ? (f[iPuesto] ?? "").trim() : "",
      tiene_ccss: ccss > 0 || cargas > 0,
      destino: "DIV",
      salario_base: iBase >= 0 ? parseCRC(f[iBase]) : 0,
      ccss_obrero: ccss,
      cargas_patronal: cargas,
      pago_adicional: iAdic >= 0 ? parseCRC(f[iAdic]) : 0,
      adelanto: iAdelanto >= 0 ? parseCRC(f[iAdelanto]) : 0,
    });
  }
  if (out.length === 0) return { error: "No encontré colaboradores en el CSV." };

  // Destino recordado por colaborador.
  const supabase = await createClient();
  const claves = [...new Set(out.map((l) => l.clave))];
  const { data: mem } = await supabase.from("colaborador_destino").select("clave, destino").in("clave", claves);
  const memMap = new Map((mem ?? []).map((m) => [m.clave, m.destino as Destino]));
  for (const l of out) l.destino = memMap.get(l.clave) ?? "DIV";

  return { titulo, fecha, quincena, lineas: out };
}

// ---------- guardar / postear / pagar / anular ----------
export async function guardarPlanilla(payload: {
  id: string | null;
  titulo: string;
  fecha: string;
  quincena: number | null;
  reparto_ch1: number;
  lineas: LineaPlanilla[];
}): Promise<{ error?: string; id?: string }> {
  await requerirPermiso("gastos.registrar");
  if (!payload.fecha) return { error: "Poné la fecha contable de la planilla." };
  if (!payload.lineas?.length) return { error: "No hay colaboradores." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_guardar_planilla", {
    p_id: payload.id,
    p_titulo: payload.titulo || null,
    p_fecha: payload.fecha,
    p_quincena: payload.quincena,
    p_reparto_ch1: payload.reparto_ch1,
    p_lineas: payload.lineas,
  });
  if (error) return { error: error.message };
  revalidatePath("/planilla");
  return { id: data as string };
}

export async function postearPlanilla(id: string): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("gastos.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_postear_planilla", { p_planilla: id });
  if (error) return { error: error.message };
  revalidatePath(`/planilla/${id}`);
  revalidatePath("/planilla");
  return { ok: "Provisión de planilla posteada." };
}

export async function pagarPlanilla(
  id: string,
  cuenta: string,
  fecha: string,
  monto: number,
): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("gastos.registrar");
  if (!cuenta) return { error: "Elegí la cuenta de banco o caja." };
  if (!fecha) return { error: "Poné la fecha del pago." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_pagar_planilla", { p_planilla: id, p_cuenta: cuenta, p_fecha: fecha, p_monto: monto });
  if (error) return { error: error.message };
  revalidatePath(`/planilla/${id}`);
  revalidatePath("/planilla");
  return { ok: "Pago registrado." };
}

export async function anularPago(pagoId: string, planillaId: string, motivo: string): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("gastos.registrar");
  if (!motivo?.trim()) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_pago_planilla", { p_pago: pagoId, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/planilla/${planillaId}`);
  revalidatePath("/planilla");
  return { ok: "Pago anulado." };
}

export async function descartarPlanilla(id: string): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("gastos.registrar");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_descartar_planilla", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/planilla");
  return { ok: "Planilla eliminada." };
}

export async function anularPlanilla(id: string, motivo: string): Promise<{ error?: string; ok?: string }> {
  await requerirPermiso("gastos.registrar");
  if (!motivo?.trim()) return { error: "La anulación exige un motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_anular_planilla", { p_planilla: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/planilla/${id}`);
  revalidatePath("/planilla");
  return { ok: "Planilla anulada." };
}
