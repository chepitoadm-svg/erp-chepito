import Link from "next/link";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function AdminPage() {
  const [puedePeriodos, puedeProrrateo, puedeCentros] = await Promise.all([
    tienePermiso("periodos.cerrar"),
    tienePermiso("prorrateo.gestionar"),
    tienePermiso("centros.gestionar"),
  ]);

  const items = [
    puedePeriodos && {
      href: "/admin/periodos",
      titulo: "Periodos contables",
      desc: "Cerrar y reabrir periodos mensuales.",
    },
    puedeProrrateo && {
      href: "/admin/prorrateo",
      titulo: "Prorrateo",
      desc: "Cargar bases y repartir los centros intermedios.",
    },
    puedeCentros && {
      href: "/admin/centros",
      titulo: "Centros de costo",
      desc: "Crear y gestionar centros y canales.",
    },
  ].filter(Boolean) as { href: string; titulo: string; desc: string }[];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No tenés permisos de administración contable.
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Administración</h1>
      <p className="mb-6 text-sm text-neutral-500">Configuración del motor contable.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((r) => (
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
