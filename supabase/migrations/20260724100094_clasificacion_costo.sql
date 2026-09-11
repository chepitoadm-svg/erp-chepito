-- =============================================================================
-- Clasificación de costos FIJO / VARIABLE para el análisis de punto de equilibrio
-- (módulo Análisis → Rentabilidad). NO es contabilidad: es un overlay de análisis
-- sobre las cuentas de resultado. Por defecto, la sección del Estado de Resultados
-- decide (costo de ventas 51-* = variable; gastos 61/62/63/64 = fijo). Esta tabla
-- guarda solo los OVERRIDES puntuales del usuario (ej. marcar "Comisiones voucher
-- Credomatic" como variable, o parte de planilla). Borrar la fila = volver al
-- default de la sección.
-- =============================================================================

create table public.clasificacion_costo (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null unique references public.cuentas(id),
  tipo           text not null check (tipo in ('fijo','variable')),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.clasificacion_costo');

alter table public.clasificacion_costo enable row level security;
create policy clc_sel on public.clasificacion_costo for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('reportes.financieros.ver'));
create policy clc_wr on public.clasificacion_costo for all to authenticated
  using (public.tengo_permiso('reportes.financieros.ver'))
  with check (public.tengo_permiso('reportes.financieros.ver'));

do $$ begin raise notice 'clasificacion_costo lista (overrides fijo/variable para punto de equilibrio).'; end $$;
