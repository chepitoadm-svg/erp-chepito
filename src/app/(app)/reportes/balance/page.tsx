import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";
import { balanza } from "@/lib/data/reportes";

const money = (n: number) =>
  Number(n).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  if (!(await tienePermiso("reportes.financieros.ver"))) redirect("/reportes");

  const sp = await searchParams;
  const fecha = sp.fecha || "2026-07-31";

  const filas = await balanza(fecha, true);
  // Solo cuentas hoja (aceptan movimiento) con saldo, para no doble-contar.
  const hojas = filas.filter((f) => f.acepta_movimiento && Number(f.saldo) !== 0);

  const seccion = (tipo: string) =>
    hojas.filter((f) => f.tipo === tipo).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const total = (tipo: string) =>
    seccion(tipo).reduce((s, f) => s + Number(f.saldo), 0);

  const activo = total("activo");
  const pasivo = total("pasivo");
  const patrimonio = total("patrimonio");
  // Resultado del periodo (aún no cerrado): se suma al patrimonio para que el
  // balance cuadre. saldo de ingreso (acreedora) = utilidad; de gasto = costo.
  const resultado =
    hojas.filter((f) => f.tipo === "ingreso").reduce((s, f) => s + Number(f.saldo), 0) -
    hojas.filter((f) => f.tipo === "gasto").reduce((s, f) => s + Number(f.saldo), 0);
  const patrimonioTotal = patrimonio + resultado;
  const pasivoPatrimonio = pasivo + patrimonioTotal;
  const cuadra = Math.abs(activo - pasivoPatrimonio) < 0.01;

  const Seccion = ({ titulo, tipo }: { titulo: string; tipo: string }) => (
    <>
      <tr className="bg-neutral-50/60">
        <td className="px-3 py-1.5 font-semibold text-neutral-800" colSpan={2}>
          {titulo}
        </td>
      </tr>
      {seccion(tipo).map((f) => (
        <tr key={f.codigo} className="border-t border-neutral-100">
          <td className="px-3 py-1.5 text-neutral-700">
            <span className="text-neutral-400">{f.codigo}</span> {f.nombre}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
            {money(Number(f.saldo))}
          </td>
        </tr>
      ))}
    </>
  );

  return (
    <div>
      <Link href="/reportes" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Reportes
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-neutral-900">Balance de Situación</h1>
      <p className="mb-4 text-sm text-neutral-500">Al {fecha}.</p>

      <form method="get" className="mb-5 flex items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Fecha de corte</label>
          <input type="date" name="fecha" defaultValue={fecha} className="rounded-md border border-neutral-300 px-2 py-1.5" />
        </div>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800">
          Aplicar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <tbody>
            <Seccion titulo="ACTIVO" tipo="activo" />
            <tr className="border-t border-neutral-200 font-medium">
              <td className="px-3 py-2 text-neutral-800">Total activo</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(activo)}</td>
            </tr>

            <Seccion titulo="PASIVO" tipo="pasivo" />
            <Seccion titulo="PATRIMONIO" tipo="patrimonio" />
            <tr className="border-t border-neutral-100">
              <td className="px-3 py-1.5 italic text-neutral-500">Resultado del periodo (sin cerrar)</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${resultado < 0 ? "text-red-600" : "text-neutral-600"}`}>
                {resultado < 0 ? `(${money(-resultado)})` : money(resultado)}
              </td>
            </tr>
            <tr className="border-t border-neutral-200 font-medium">
              <td className="px-3 py-2 text-neutral-800">Total pasivo + patrimonio</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(pasivoPatrimonio)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`mt-3 rounded-md px-4 py-2 text-sm ${cuadra ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
        {cuadra
          ? "✓ El balance cuadra: Activo = Pasivo + Patrimonio."
          : `Descuadre de ${money(activo - pasivoPatrimonio)}. Revisá si hay asientos sin confirmar.`}
      </div>
    </div>
  );
}
