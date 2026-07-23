-- =============================================================================
-- bootstrap_admin.sql — Promover al PRIMER usuario a administrador.
-- =============================================================================
-- Problema del huevo y la gallina: para gestionar usuarios hay que ser admin,
-- pero el primer admin no lo puede crear nadie desde la app. Este script se
-- corre UNA sola vez, a mano, después de haber creado el primer usuario en
-- Supabase Auth (Dashboard > Authentication > Users > Add user, con email y
-- contraseña). El trigger fn_handle_new_user ya le creó su fila en perfiles.
--
-- Cómo usarlo:
--   1. Reemplazá el email de abajo por el del usuario que será administrador.
--   2. Corré este archivo contra la base (SQL Editor del Dashboard o psql).
--   3. Ese usuario queda como administrador con TODAS las sucursales asignadas.
-- =============================================================================

do $$
declare
  v_email    text := 'chepitoadm@gmail.com';   -- <<< CAMBIAR por el email real
  v_user_id  uuid;
  v_rol_id   uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception 'No existe un usuario de Auth con email %. Creálo primero en el Dashboard.', v_email;
  end if;

  select id into v_rol_id from public.roles where codigo = 'administrador';

  -- Asignar rol administrador y dejar el perfil activo.
  update public.perfiles
     set rol_id = v_rol_id,
         estado = 'activo',
         nombre_completo = coalesce(nullif(nombre_completo, ''), 'Administrador')
   where id = v_user_id;

  -- Asignar TODAS las sucursales.
  insert into public.usuarios_sucursales (usuario_id, sucursal_id)
  select v_user_id, s.id from public.sucursales s
  on conflict do nothing;

  raise notice 'Usuario % promovido a administrador con todas las sucursales.', v_email;
end $$;
