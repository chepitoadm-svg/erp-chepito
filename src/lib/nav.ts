// Estructura del menú principal del ERP — fuente única de verdad para la barra
// de navegación y el buscador global. No contiene lógica de negocio; solo el
// mapa de módulos, sus rutas, descripciones e íconos.

export type IconKey =
  | "compras"
  | "ventas"
  | "inventario"
  | "tesoreria"
  | "gastos"
  | "asientos"
  | "costos"
  | "cierre"
  | "reportes"
  | "planilla"
  | "usuarios"
  | "perfiles"
  | "auditoria"
  | "panaderias"
  | "config";

export interface NavItem {
  label: string;
  href: string;
  desc: string;
  icon: IconKey;
}

export interface NavEntry {
  label: string;
  icon?: IconKey;
  /** Entrada directa (sin desplegable). */
  href?: string;
  /** Entrada con desplegable. */
  items?: NavItem[];
}

export const NAV: NavEntry[] = [
  {
    label: "Operación",
    items: [
      { label: "Compras", href: "/compras", desc: "Facturas, recepciones y cuentas por pagar.", icon: "compras" },
      { label: "Ventas", href: "/ventas", desc: "Ventas del día por sucursal y mayoreo.", icon: "ventas" },
      { label: "Inventario", href: "/inventario", desc: "Existencias, kardex y transferencias.", icon: "inventario" },
      { label: "Tesorería", href: "/tesoreria/conciliaciones", desc: "Conciliación bancaria y datáfono.", icon: "tesoreria" },
      { label: "Gastos", href: "/gastos", desc: "Gastos del mes por centro de costo.", icon: "gastos" },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { label: "Asientos", href: "/asientos", desc: "Libro diario: crear, confirmar y anular.", icon: "asientos" },
      { label: "Costos", href: "/costos", desc: "Costo de ventas del mes.", icon: "costos" },
      { label: "Cierre", href: "/cierre", desc: "Checklist de cierre mensual.", icon: "cierre" },
      { label: "Reportes", href: "/reportes", desc: "Flujo, resultados, balance y mayor.", icon: "reportes" },
    ],
  },
  { label: "Planilla", href: "/planilla", icon: "planilla" },
  {
    label: "Administración",
    items: [
      { label: "Usuarios", href: "/usuarios", desc: "Altas, edición y contraseñas.", icon: "usuarios" },
      { label: "Perfiles", href: "/roles", desc: "Perfiles de acceso y permisos.", icon: "perfiles" },
      { label: "Auditoría", href: "/auditoria", desc: "Quién hizo qué y tiempo de trabajo.", icon: "auditoria" },
      { label: "Panaderías", href: "/panaderias", desc: "Datos por sucursal (NIS de agua/luz…).", icon: "panaderias" },
      { label: "Configuración", href: "/admin", desc: "Periodos, prorrateo y centros de costo.", icon: "config" },
    ],
  },
];

/** Un objetivo navegable del buscador. */
export interface NavTarget extends NavItem {
  grupo: string;
}

/** Lista plana de todos los módulos (para el buscador). Incluye las entradas
 *  directas como un item más. */
export function navTargets(): NavTarget[] {
  const out: NavTarget[] = [];
  for (const e of NAV) {
    if (e.items) {
      for (const it of e.items) out.push({ ...it, grupo: e.label });
    } else if (e.href) {
      out.push({ label: e.label, href: e.href, desc: "", icon: e.icon ?? "config", grupo: e.label });
    }
  }
  return out;
}
