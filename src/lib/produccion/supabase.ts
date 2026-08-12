// Cliente de SOLO LECTURA al Supabase de la app de PRODUCCIÓN (proyecto distinto
// al del ERP, separado a propósito). El ERP jala datos; NUNCA escribe acá.
// La llave es la PUBLISHABLE (anon) que ya viaja pública en el HTML de la app,
// protegida por RLS. Se puede sobreescribir por variables de entorno
// (SUPA_PRODUCCION_URL / SUPA_PRODUCCION_KEY) sin tocar el código.
import "server-only";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPA_PRODUCCION_URL || "https://fqwxhrxjphvqjtosxizb.supabase.co";
const KEY = process.env.SUPA_PRODUCCION_KEY || "sb_publishable_FY_EOBRsE77frSsPFSsexA_ZWGc5AQF";

export function getProduccionDb() {
  // Sin sesión persistente; es una lectura puntual del servidor.
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
