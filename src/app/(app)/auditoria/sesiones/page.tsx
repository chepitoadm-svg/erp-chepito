import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarSesiones, usuariosConSesiones, type SesionBloque } from "@/lib/data/sesiones";

const inputCls =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-700 focus:border-neutral-500 focus:outline-none";

// Minutos -> "Xh Ym" / "Ym".
function dur(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

type SP = { usuario?: string; desde?: string; hasta?: string };

export default async function SesionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await tienePermiso("auditoria.ver"))) redirect("/");
  const sp = await searchParams;
  const filtro = { usuario: sp.usuario || undefined, desde: sp.desde || undefined, hasta: sp.hasta || undefined };

  const [bloques, usuarios] = await Promise.all([listarSesiones(filtro), usuariosConSesiones()]);
  const hayFiltro = !!(sp.usuario || sp.desde || sp.hasta);

  // Agrupar por usuario -> día.
  type Dia = { dia: string; dia_txt: string; total: number; bloques: SesionBloque[] };
  type Usr = { usuario_id: string; nombre: string; total: number; dias: Map<string, Dia> };
  const porUsuario = new Map<string, Usr>();
  for (const b of bloques) {
    const u =
      porUsuario.get(b.usuario_id) ??
      porUsuario.set(b.usuario_id, {
        usuario_id: b.usuario_id,
        nombre: b.usuario_nombre ?? "(sin nombre)",
        total: 0,
        dias: new Map(),
      }).get(b.usuario_id)!;
    u.total += b.duracion_min;
    const d =
      u.dias.get(b.dia) ??
      u.dias.set(b.dia, { dia: b.dia, dia_txt: b.dia_txt, total: 0, bloques: [] }).get(b.dia)!;
    d.total += b.duracion_min;
    d.bloques.push(b);
  }
  const usuariosOrd = [...porUsuario.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const totalGeneral = bloques.reduce((s, b) => s + b.duracion_min, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Tiempo de trabajo</h1>
          <p className="text-sm text-neutral-500">
            Cuánto tiempo estuvo cada usuario usando el sistema. Cuenta solo la actividad real; las
            pausas de más de 30 minutos abren un bloque nuevo y no suman.
          </p>
        </div>
        <Link href="/auditoria" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Movimientos
        </Link>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Usuario
          <select name="usuario" defaultValue={sp.usuario ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.usuario_id} value={u.usuario_id}>
                {u.nombre_completo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={inputCls} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Filtrar
        </button>
        {hayFiltro && (
          <Link href="/auditoria/sesiones" className="px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Limpiar
          </Link>
        )}
      </form>

      {bloques.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400">
          {hayFiltro ? "Sin actividad con esos filtros." : "Todavía no hay actividad registrada."}
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <span className="text-neutral-500">Total en el periodo mostrado: </span>
            <span className="font-semibold text-neutral-900">{dur(totalGeneral)}</span>
          </div>

          <div className="space-y-6">
            {usuariosOrd.map((u) => {
              const dias = [...u.dias.values()].sort((a, b) => b.dia.localeCompare(a.dia));
              return (
                <div key={u.usuario_id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
                    <span className="font-semibold text-neutral-900">{u.nombre}</span>
                    <span className="text-sm text-neutral-600">
                      Total: <span className="font-semibold text-neutral-900">{dur(u.total)}</span>
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-neutral-100">
                      {dias.map((d) => (
                        <tr key={d.dia} className="align-top">
                          <td className="w-32 px-4 py-3 font-medium text-neutral-700">{d.dia_txt}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {d.bloques.map((b) => (
                                <span
                                  key={b.id}
                                  className={`rounded-full border px-2 py-0.5 text-xs ${
                                    b.activa
                                      ? "border-green-200 bg-green-50 text-green-700"
                                      : "border-neutral-200 bg-neutral-50 text-neutral-600"
                                  }`}
                                  title={b.activa ? "Bloque en curso" : undefined}
                                >
                                  {b.hora_inicio}–{b.hora_fin} · {dur(b.duracion_min)}
                                  {b.activa ? " ●" : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="w-24 px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                            {dur(d.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
