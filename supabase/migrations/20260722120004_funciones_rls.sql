-- =============================================================================
-- 20260722120004_funciones_rls.sql
-- Funciones helper para las políticas RLS. Todas STABLE y SECURITY DEFINER:
--   - STABLE  -> el planner puede cachearlas dentro de la consulta (rendimiento).
--   - SECURITY DEFINER -> leen perfiles/roles sin ser bloqueadas por RLS y sin
--     recursión infinita en las políticas de esas mismas tablas.
-- Se usa (select auth.uid()) para que el valor se evalúe una sola vez por query.
-- =============================================================================

-- Sucursales asignadas al usuario actual.
create or replace function public.mis_sucursales()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select us.sucursal_id
  from public.usuarios_sucursales us
  where us.usuario_id = (select auth.uid())
$$;

-- ¿El usuario actual es administrador (rol de sistema con acceso total)?
create or replace function public.soy_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    join public.roles r on r.id = p.rol_id
    where p.id = (select auth.uid())
      and p.estado = 'activo'
      and r.codigo = 'administrador'
  )
$$;

-- ¿El usuario actual tiene un permiso concreto? Admin siempre lo tiene.
create or replace function public.tengo_permiso(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.soy_administrador()
    or exists (
      select 1
      from public.perfiles p
      join public.roles_permisos rp on rp.rol_id = p.rol_id
      join public.permisos pm on pm.id = rp.permiso_id
      where p.id = (select auth.uid())
        and p.estado = 'activo'
        and pm.codigo = p_codigo
    )
$$;

-- ¿El usuario actual comparte al menos una sucursal con el usuario objetivo?
-- Base del "solo gestiono usuarios de mis sucursales".
create or replace function public.comparte_sucursal_con(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_sucursales a
    join public.usuarios_sucursales b on b.sucursal_id = a.sucursal_id
    where a.usuario_id = (select auth.uid())
      and b.usuario_id = p_usuario
  )
$$;

-- Permisos a los roles autenticado/anon para invocar los helpers vía RPC.
grant execute on function public.mis_sucursales() to authenticated;
grant execute on function public.soy_administrador() to authenticated;
grant execute on function public.tengo_permiso(text) to authenticated;
grant execute on function public.comparte_sucursal_con(uuid) to authenticated;
