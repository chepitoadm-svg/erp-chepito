// Formatea una fecha ISO (YYYY-MM-DD, como vienen de Postgres `date`) a
// DD/MM/AAAA para mostrar. Parsea los segmentos directamente para NO desfasar
// por zona horaria (CR es UTC-6; `new Date("2026-08-31")` caería un día antes).
export function fechaCR(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
