import Link from "next/link";
import { redirect } from "next/navigation";
import { tienePermiso } from "@/lib/auth/permisos";

const REPORTES = [
  {
    href: "/reportes/resultados",
    titulo: "Estado de Resultados",
    desc: "Rentabilidad por canal, antes y después de prorrateo.",
  },
  {
    href: "/reportes/balance",
    titulo: "Balance de Situación",
    desc: "Activo, pasivo y patrimonio a una fecha.",
  },
  {
    href: "/reportes/balanza",
    titulo: "Balanza de comprobación",
    desc: "Débitos, créditos y saldos, acumulados por el catálogo.",
  },
  {
    href: "/reportes/mayor",
    titulo: "Libro Mayor",
    desc: "Movimientos y saldo acumulado de una cuenta.",
  },
];

export default async function ReportesPage() {
  if (!(await tienePermiso("reportes.financieros.ver"))) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No tenés permiso para ver los reportes financieros.
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Reportes</h1>
      <p className="mb-6 text-sm text-neutral-500">Estados financieros y libros contables.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">{r.titulo}</div>
            <div className="mt-1 text-sm text-neutral-500">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
