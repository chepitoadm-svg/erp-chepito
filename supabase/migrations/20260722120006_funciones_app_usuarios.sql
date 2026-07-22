-- =============================================================================
-- 20260722120006_funciones_app_usuarios.sql
-- Funciones de lectura para la gestión de usuarios. SECURITY DEFINER para poder
-- leer el email desde auth.users, pero aplicando la MISMA regla de visibilidad
-- que el RLS de perfiles (admin ve todo; el resto, usuarios de sus sucursales).
-- =============================================================================

-- Listado de usuarios visibles para el usuario actual, con email, rol y sucursales.
create or replace function public.app_listar_usuarios()
returns table (
  id              uuid,
  nombre_completo text,
  email           text,
  estado          text,
  rol_id          uuid,
  rol_codigo      text,
  rol_nombre      text,
  sucursales      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre_completo,
    u.email::text,
    p.estado,
    p.rol_id,
    r.codigo,
    r.nombre,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nombre', s.nombre)
                order by s.codigo)
       from public.usuarios_sucursales us
       join public.sucursales s on s.id = us.sucursal_id
       where us.usuario_id = p.id),
      '[]'::jsonb
    ) as sucursales
  from public.perfiles p
  left join public.roles r on r.id = p.rol_id
  join auth.users u on u.id = p.id
  where public.soy_administrador()
     or p.id = (select auth.uid())
     or (public.tengo_permiso('usuarios.ver') and public.comparte_sucursal_con(p.id))
  order by p.nombre_completo;
$$;

grant execute on function public.app_listar_usuarios() to authenticated;

-- Un usuario por id (misma visibilidad).
create or replace function public.app_obtener_usuario(p_id uuid)
returns table (
  id              uuid,
  nombre_completo text,
  email           text,
  estado          text,
  rol_id          uuid,
  sucursales      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre_completo,
    u.email::text,
    p.estado,
    p.rol_id,
    coalesce(
      (select jsonb_agg(us.sucursal_id)
       from public.usuarios_sucursales us
       where us.usuario_id = p.id),
      '[]'::jsonb
    ) as sucursales
  from public.perfiles p
  join auth.users u on u.id = p.id
  where p.id = p_id
    and (
      public.soy_administrador()
      or p.id = (select auth.uid())
      or (public.tengo_permiso('usuarios.ver') and public.comparte_sucursal_con(p.id))
    );
$$;

grant execute on function public.app_obtener_usuario(uuid) to authenticated;
