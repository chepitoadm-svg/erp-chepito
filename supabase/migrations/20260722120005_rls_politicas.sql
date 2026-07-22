-- =============================================================================
-- 20260722120005_rls_politicas.sql
-- Row Level Security en TODAS las tablas (regla dura #7, desde el día uno).
-- Patrón:
--   * SELECT: catálogos globales visibles a autenticados; datos por sucursal
--     solo si la sucursal está asignada al usuario (o es administrador).
--   * INSERT/UPDATE: requieren el permiso del módulo.
--   * DELETE: SIN política -> denegado. "Anular, nunca borrar" (dar de baja =
--     UPDATE estado). Se exceptúan tablas de enlace de configuración pura
--     (roles_permisos, usuarios_sucursales), que sí permiten quitar filas.
-- Los helpers usados aquí son SECURITY DEFINER: no hay recursión de RLS.
-- =============================================================================

-- === EMPRESA ================================================================
alter table public.empresa enable row level security;

create policy empresa_select on public.empresa
  for select to authenticated using (true);

create policy empresa_insert on public.empresa
  for insert to authenticated with check (public.tengo_permiso('empresa.gestionar'));

create policy empresa_update on public.empresa
  for update to authenticated
  using (public.tengo_permiso('empresa.gestionar'))
  with check (public.tengo_permiso('empresa.gestionar'));

-- === SUCURSALES =============================================================
alter table public.sucursales enable row level security;

create policy sucursales_select on public.sucursales
  for select to authenticated
  using (public.soy_administrador() or id in (select public.mis_sucursales()));

create policy sucursales_insert on public.sucursales
  for insert to authenticated with check (public.tengo_permiso('sucursales.gestionar'));

create policy sucursales_update on public.sucursales
  for update to authenticated
  using (public.tengo_permiso('sucursales.gestionar'))
  with check (public.tengo_permiso('sucursales.gestionar'));

-- === BODEGAS ================================================================
alter table public.bodegas enable row level security;

create policy bodegas_select on public.bodegas
  for select to authenticated
  using (public.soy_administrador() or sucursal_id in (select public.mis_sucursales()));

create policy bodegas_insert on public.bodegas
  for insert to authenticated
  with check (
    public.tengo_permiso('bodegas.gestionar')
    and (public.soy_administrador() or sucursal_id in (select public.mis_sucursales()))
  );

create policy bodegas_update on public.bodegas
  for update to authenticated
  using (public.soy_administrador() or sucursal_id in (select public.mis_sucursales()))
  with check (
    public.tengo_permiso('bodegas.gestionar')
    and (public.soy_administrador() or sucursal_id in (select public.mis_sucursales()))
  );

-- === CUENTAS (catálogo global) ==============================================
alter table public.cuentas enable row level security;

create policy cuentas_select on public.cuentas
  for select to authenticated using (true);

create policy cuentas_insert on public.cuentas
  for insert to authenticated with check (public.tengo_permiso('cuentas.gestionar'));

create policy cuentas_update on public.cuentas
  for update to authenticated
  using (public.tengo_permiso('cuentas.gestionar'))
  with check (public.tengo_permiso('cuentas.gestionar'));

-- === PERIODOS CONTABLES =====================================================
alter table public.periodos_contables enable row level security;

create policy periodos_select on public.periodos_contables
  for select to authenticated using (true);

create policy periodos_insert on public.periodos_contables
  for insert to authenticated with check (public.tengo_permiso('periodos.gestionar'));

create policy periodos_update on public.periodos_contables
  for update to authenticated
  using (public.tengo_permiso('periodos.gestionar'))
  with check (public.tengo_permiso('periodos.gestionar'));

-- === ROLES (catálogo global) ================================================
alter table public.roles enable row level security;

create policy roles_select on public.roles
  for select to authenticated using (true);

create policy roles_insert on public.roles
  for insert to authenticated with check (public.tengo_permiso('roles.gestionar'));

create policy roles_update on public.roles
  for update to authenticated
  using (public.tengo_permiso('roles.gestionar'))
  with check (public.tengo_permiso('roles.gestionar'));

-- === PERMISOS (catálogo de solo lectura para clientes) ======================
alter table public.permisos enable row level security;

create policy permisos_select on public.permisos
  for select to authenticated using (true);
-- Sin políticas de escritura: se gestionan por migración/seed (service_role).

-- === ROLES_PERMISOS (enlace de configuración) ===============================
alter table public.roles_permisos enable row level security;

create policy roles_permisos_select on public.roles_permisos
  for select to authenticated using (true);

create policy roles_permisos_insert on public.roles_permisos
  for insert to authenticated with check (public.tengo_permiso('roles.gestionar'));

create policy roles_permisos_delete on public.roles_permisos
  for delete to authenticated using (public.tengo_permiso('roles.gestionar'));

-- === PERFILES (usuarios) ====================================================
alter table public.perfiles enable row level security;

-- Cada quien se ve a sí mismo; admin ve todo; con permiso, se ven usuarios que
-- comparten alguna sucursal (gestión acotada por sucursal).
create policy perfiles_select on public.perfiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.soy_administrador()
    or (public.tengo_permiso('usuarios.ver') and public.comparte_sucursal_con(id))
  );

create policy perfiles_insert on public.perfiles
  for insert to authenticated with check (public.tengo_permiso('usuarios.crear'));

create policy perfiles_update on public.perfiles
  for update to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('usuarios.editar') and public.comparte_sucursal_con(id)))
  with check (public.soy_administrador() or (public.tengo_permiso('usuarios.editar') and public.comparte_sucursal_con(id)));

-- === USUARIOS_SUCURSALES (enlace que define el alcance) =====================
alter table public.usuarios_sucursales enable row level security;

create policy usuarios_sucursales_select on public.usuarios_sucursales
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or public.soy_administrador()
    or public.tengo_permiso('usuarios.ver')
  );

create policy usuarios_sucursales_insert on public.usuarios_sucursales
  for insert to authenticated with check (public.tengo_permiso('usuarios.editar'));

create policy usuarios_sucursales_delete on public.usuarios_sucursales
  for delete to authenticated using (public.tengo_permiso('usuarios.editar'));

-- === AUDITORIA (solo lectura con permiso; inmutable para clientes) ==========
alter table public.auditoria enable row level security;

create policy auditoria_select on public.auditoria
  for select to authenticated using (public.tengo_permiso('auditoria.ver'));
-- Sin políticas de INSERT/UPDATE/DELETE: se escribe solo vía trigger SECURITY DEFINER.
