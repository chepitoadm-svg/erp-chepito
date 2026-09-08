import type { IconKey } from "@/lib/nav";

// Íconos de línea, monocromáticos (currentColor, trazo fino). 24×24.
const PATHS: Record<IconKey, React.ReactNode> = {
  compras: <path d="M3 5h2l1.2 10.5a1 1 0 0 0 1 .9h8.6a1 1 0 0 0 1-.8L18.5 8H6M9 20a1 1 0 1 0 0-.01M16 20a1 1 0 1 0 0-.01" />,
  ventas: (
    <>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l7 7-8 8-7-7Z" />
      <circle cx="9" cy="9" r="1.3" />
    </>
  ),
  inventario: (
    <>
      <path d="M3 8l9-4 9 4-9 4-9-4Z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </>
  ),
  tesoreria: (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9v9h16V9" />
      <path d="M8 12v3M12 12v3M16 12v3M3 21h18" />
    </>
  ),
  gastos: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </>
  ),
  asientos: (
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  costos: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01" />
    </>
  ),
  cierre: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" />
    </>
  ),
  reportes: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 20v-6M12 20v-10M16 20v-4" />
    </>
  ),
  analisis: (
    <>
      <path d="M4 19V5" />
      <path d="M4 15l4-4 3 3 6-7" />
      <path d="M17 7h3v3" />
    </>
  ),
  planilla: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 4a3 3 0 0 1 0 6M18 20a6 6 0 0 0-4-5.6" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  perfiles: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 4v3" />,
  auditoria: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  panaderias: (
    <>
      <path d="M4 9l1-4h14l1 4" />
      <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M9 20v-5h6v5" />
    </>
  ),
  config: (
    <>
      <path d="M4 7h10M18 7h2M4 17h6M14 17h6" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
    </>
  ),
};

export default function NavIcon({ name, className = "h-4 w-4" }: { name: IconKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
