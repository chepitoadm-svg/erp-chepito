// Utilidades puras para ligar líneas del estado de cuenta con proveedores.
// Sin dependencias de servidor: se usan en la capa de datos y en el cliente.

export interface AliasProveedor {
  alias: string;
  nombre: string;
}

// Texto completo de una línea del banco, para buscar coincidencias.
export function textoLinea(referencia: string | null, descripcion: string | null): string {
  return `${referencia ?? ""} ${descripcion ?? ""}`.trim();
}

// Detecta el proveedor de una línea: gana el alias MÁS LARGO que aparezca en el
// texto (el más específico). Devuelve el nombre del proveedor o null.
export function detectarProveedor(
  referencia: string | null,
  descripcion: string | null,
  aliases: AliasProveedor[],
): string | null {
  const t = textoLinea(referencia, descripcion).toLowerCase();
  if (!t) return null;
  let mejor: { len: number; nombre: string } | null = null;
  for (const a of aliases) {
    const al = a.alias.trim().toLowerCase();
    if (al.length >= 3 && t.includes(al)) {
      if (!mejor || al.length > mejor.len) mejor = { len: al.length, nombre: a.nombre };
    }
  }
  return mejor?.nombre ?? null;
}

// Propone el identificador a guardar cuando el usuario asigna un proveedor a una
// línea: el número de cuenta destino de un TEF/SINPE ("... A : 900973348"), o el
// primer número largo; si no hay número, la descripción tal cual.
export function extraerIdentificador(referencia: string | null, descripcion: string | null): string {
  const txt = textoLinea(referencia, descripcion);
  const mA = txt.match(/A\s*:?\s*([0-9][0-9-]{4,})/i);
  if (mA) return mA[1].replace(/-+$/, "");
  const mNum = txt.match(/([0-9]{5,})/);
  if (mNum) return mNum[1];
  return (descripcion ?? "").trim();
}
