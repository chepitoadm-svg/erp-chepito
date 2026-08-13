import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { listarFuentesCorreo } from "@/lib/data/correo";
import NuevaFuenteCorreo from "@/components/NuevaFuenteCorreo";
import JalarAhora from "@/components/JalarAhora";
import { toggleFuenteCorreo, editarDesdeFuente } from "./actions";

export default async function CorreoPage() {
  if (!(await tienePermiso("compras.facturar"))) redirect("/compras");
  const fuentes = await listarFuentesCorreo();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

  return (
    <div>
      <Link href="/compras" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Compras
      </Link>
      <h1 className="mt-1 mb-1 text-lg font-semibold text-neutral-900">Jalar facturas del correo</h1>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Elegí de qué remitentes querés que el sistema jale los XML automáticamente y desde qué fecha.
        Cada factura entra en <strong>borrador</strong> para que la revisés y confirmés. Prendé o
        apagá cada remitente cuando quieras.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-sm text-neutral-600">
          El sistema revisa el correo <strong>solo cada 15 minutos</strong>. Si querés traerlas ya:
        </p>
        <JalarAhora />
      </div>

      <div className="mb-5">
        <NuevaFuenteCorreo hoy={hoy} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Remitente</th>
              <th className="px-4 py-3 font-medium">Desde</th>
              <th className="px-4 py-3 font-medium">Último jalado</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {fuentes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Todavía no hay remitentes. Agregá uno arriba.
                </td>
              </tr>
            )}
            {fuentes.map((f) => (
              <tr key={f.id} className={f.activo ? "" : "opacity-50"}>
                <td className="px-4 py-3 font-medium text-neutral-900">{f.etiqueta}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-600">{f.remitente}</td>
                <td className="px-4 py-3">
                  <form action={editarDesdeFuente} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      type="date"
                      name="desde"
                      defaultValue={f.desde?.slice(0, 10)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                    >
                      Guardar
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">
                  {f.ultimo_jalado ? new Date(f.ultimo_jalado).toLocaleString("es-CR") : "—"}
                </td>
                <td className="px-4 py-3">
                  <form action={toggleFuenteCorreo}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="activo" value={String(f.activo)} />
                    <button
                      type="submit"
                      className={
                        "rounded-full px-3 py-1 text-xs font-medium " +
                        (f.activo
                          ? "bg-green-50 text-green-700 hover:bg-green-100"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200")
                      }
                    >
                      {f.activo ? "Activo" : "Apagado"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
