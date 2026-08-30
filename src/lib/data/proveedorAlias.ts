import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AliasProveedor } from "@/lib/bancoAlias";

export interface AliasListado {
  id: string;
  alias: string;
  proveedor_id: string;
  proveedor_nombre: string;
}

// Para la pantalla de administración: alias con su proveedor.
export async function listarAliasProveedor(): Promise<AliasListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedor_alias_banco")
    .select("id, alias, proveedor_id, proveedor:proveedores(nombre)")
    .order("alias");
  if (error) throw new Error(`No se pudieron cargar los alias: ${error.message}`);
  return ((data ?? []) as unknown as {
    id: string;
    alias: string;
    proveedor_id: string;
    proveedor: { nombre: string } | null;
  }[]).map((r) => ({
    id: r.id,
    alias: r.alias,
    proveedor_id: r.proveedor_id,
    proveedor_nombre: r.proveedor?.nombre ?? "—",
  }));
}

// Mapa alias→nombre para detectar proveedores en la conciliación.
export async function obtenerMapaAlias(): Promise<AliasProveedor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedor_alias_banco")
    .select("alias, proveedor:proveedores(nombre)");
  return ((data ?? []) as unknown as { alias: string; proveedor: { nombre: string } | null }[])
    .filter((r) => r.proveedor)
    .map((r) => ({ alias: r.alias, nombre: r.proveedor!.nombre }));
}
