import Link from "next/link";
import { tienePermiso } from "@/lib/auth/permisos";

const SECCIONES = [
  {
    href: "/inventario/articulos",
    titulo: "Artículos",
    desc: "Catálogo: unidad, IVA, cuenta de inventario y existencias.",
    permiso: "articulos.gestionar",
  },
  {
    href: "/inventario/existencias",
    titulo: "Existencias valoradas",
    desc: "Cantidad y valor por bodega, al promedio ponderado.",
    permiso: "inventario.ver",
  },
  {
    href: "/inventario/kardex",
    titulo: "Kardex",
    desc: "Movimientos de un artículo, con existencia y promedio.",
    permiso: "inventario.ver",
  },
  {
    href: "/inventario/carga-inicial",
    titulo: "Carga inicial",
    desc: "Ingresar existencias de arranque y conciliar con la apertura.",
    permiso: "inventario.ajustar",
  },
  {
    href: "/inventario/ajustes",
    titulo: "Ajustes",
    desc: "Mermas y sobrantes, con su asiento al confirmar.",
    permiso: "inventario.ver",
  },
  {
    href: "/inventario/transferencias",
    titulo: "Transferencias",
    desc: "Mover mercadería entre bodegas, en dos pasos con tránsito.",
    permiso: "inventario.ver",
  },
  {
    href: "/inventario/libro",
    titulo: "Libro de Inventarios",
    desc: "Detalle valuado por ítem a una fecha (libro legal).",
    permiso: "inventario.ver",
  },
];

export default async function InventarioPage() {
  const permisos = await Promise.all(SECCIONES.map((s) => tienePermiso(s.permiso)));
  const visibles = SECCIONES.filter((_, i) => permisos[i]);

  if (visibles.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No tenés permiso para ver el módulo de inventario.
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Inventario</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Catálogo, existencias valoradas al promedio ponderado y kardex.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibles.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
          >
            <div className="font-medium text-neutral-900">{s.titulo}</div>
            <div className="mt-1 text-sm text-neutral-500">{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
