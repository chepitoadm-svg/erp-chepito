-- =============================================================================
-- Perfiles de acceso (roles) editables + permisos puntuales por usuario.
--   * usuarios_permisos: concede o revoca un permiso a UN usuario, por encima
--     de lo que trae su rol (los "ajustes puntuales").
--   * tengo_permiso ahora considera: admin = todo; si no, el permiso debe venir
--     del rol o estar concedido al usuario, y NO estar revocado al usuario.
--   * RPCs para crear/editar/activar roles, fijar sus permisos y los overrides.
-- Un rol nunca se borra: se desactiva (regla dura #3, "anular nunca borrar").
-- =============================================================================

create table public.usuarios_permisos (
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  efecto     text not null check (efecto in ('conceder','revocar')),
  creado_en  timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  primary key (usuario_id, permiso_id)
);
create index usuarios_permisos_usuario on public.usuarios_permisos (usuario_id);

alter table public.usuarios_permisos enable row level security;
create policy up_sel on public.usuarios_permisos for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('usuarios.ver') or usuario_id = (select auth.uid()));
create policy up_wr on public.usuarios_permisos for all to authenticated
  using (public.tengo_permiso('usuarios.editar')) with check (public.tengo_permiso('usuarios.editar'));

-- ---------------------------------------------------------------------------
-- tengo_permiso: rol + concesiones puntuales − revocaciones puntuales.
-- ---------------------------------------------------------------------------
create or replace function public.tengo_permiso(p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_administrador()
    or (
      not exists (  -- no revocado explícitamente al usuario
        select 1 from public.usuarios_permisos up
        join public.permisos pm on pm.id = up.permiso_id
        where up.usuario_id = (select auth.uid())
          and up.efecto = 'revocar' and pm.codigo = p_codigo
      )
      and (
        exists (  -- viene del rol
          select 1 from public.perfiles p
          join public.roles_permisos rp on rp.rol_id = p.rol_id
          join public.permisos pm on pm.id = rp.permiso_id
          where p.id = (select auth.uid()) and p.estado = 'activo' and pm.codigo = p_codigo
        )
        or exists (  -- concedido puntualmente al usuario
          select 1 from public.usuarios_permisos up
          join public.permisos pm on pm.id = up.permiso_id
          join public.perfiles p on p.id = up.usuario_id
          where up.usuario_id = (select auth.uid()) and p.estado = 'activo'
            and up.efecto = 'conceder' and pm.codigo = p_codigo
        )
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Slug para el código de roles nuevos (sin unaccent en la base).
-- ---------------------------------------------------------------------------
create or replace function public.fn_slug(p_txt text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(p_txt,''),
          'áéíóúàèìòùäëïöüâêîôûñ ', 'aeiouaeiouaeiouaeioun_')),
        '[^a-z0-9_]', '', 'g'),
      '_+', '_', 'g'),
    '');
$$;

-- ---------------------------------------------------------------------------
-- Crear rol nuevo con su set de permisos. Devuelve el id.
-- ---------------------------------------------------------------------------
create or replace function public.fn_crear_rol(p_nombre text, p_descripcion text, p_permisos uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_base text; v_cod text; v_n int := 0;
begin
  if not public.tengo_permiso('roles.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'El nombre del perfil es obligatorio.'; end if;
  v_base := coalesce(public.fn_slug(p_nombre), 'rol');
  v_cod := v_base;
  while exists (select 1 from public.roles where codigo = v_cod) loop
    v_n := v_n + 1; v_cod := v_base || '_' || v_n;
  end loop;
  insert into public.roles (codigo, nombre, descripcion, es_sistema, estado)
    values (v_cod, btrim(p_nombre), nullif(btrim(coalesce(p_descripcion,'')),''), false, 'activo')
    returning id into v_id;
  if p_permisos is not null then
    insert into public.roles_permisos (rol_id, permiso_id)
      select v_id, x from unnest(p_permisos) x on conflict do nothing;
  end if;
  return v_id;
end $$;
grant execute on function public.fn_crear_rol(text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Editar rol: nombre/descripción + reemplazar su set de permisos.
-- El rol 'administrador' es absoluto: no se le tocan permisos (siempre puede todo).
-- ---------------------------------------------------------------------------
create or replace function public.fn_editar_rol(p_rol uuid, p_nombre text, p_descripcion text, p_permisos uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  if not public.tengo_permiso('roles.gestionar') then raise exception 'No tenés permiso.'; end if;
  select codigo into v_cod from public.roles where id = p_rol;
  if v_cod is null then raise exception 'Perfil inexistente.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 then raise exception 'El nombre del perfil es obligatorio.'; end if;
  update public.roles
     set nombre = btrim(p_nombre),
         descripcion = nullif(btrim(coalesce(p_descripcion,'')),'')
   where id = p_rol;
  if v_cod = 'administrador' then return; end if;  -- el admin puede todo, no se edita su set
  delete from public.roles_permisos where rol_id = p_rol;
  if p_permisos is not null then
    insert into public.roles_permisos (rol_id, permiso_id)
      select p_rol, x from unnest(p_permisos) x on conflict do nothing;
  end if;
end $$;
grant execute on function public.fn_editar_rol(uuid, text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Activar / desactivar un rol. No se permite en roles de sistema, ni si hay
-- usuarios activos con ese rol asignado.
-- ---------------------------------------------------------------------------
create or replace function public.fn_cambiar_estado_rol(p_rol uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare v_sistema boolean; v_uso int;
begin
  if not public.tengo_permiso('roles.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_estado not in ('activo','inactivo') then raise exception 'Estado inválido.'; end if;
  select es_sistema into v_sistema from public.roles where id = p_rol;
  if v_sistema is null then raise exception 'Perfil inexistente.'; end if;
  if v_sistema then raise exception 'Los perfiles del sistema no se desactivan.'; end if;
  if p_estado = 'inactivo' then
    select count(*) into v_uso from public.perfiles where rol_id = p_rol and estado = 'activo';
    if v_uso > 0 then raise exception 'No se puede desactivar: % usuario(s) activo(s) tienen este perfil.', v_uso; end if;
  end if;
  update public.roles set estado = p_estado where id = p_rol;
end $$;
grant execute on function public.fn_cambiar_estado_rol(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Overrides por usuario: reemplaza el set de concedidos/revocados del usuario.
-- ---------------------------------------------------------------------------
create or replace function public.fn_set_permisos_usuario(p_usuario uuid, p_conceder uuid[], p_revocar uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('usuarios.editar') then raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from public.perfiles where id = p_usuario) then raise exception 'Usuario inexistente.'; end if;
  delete from public.usuarios_permisos where usuario_id = p_usuario;
  insert into public.usuarios_permisos (usuario_id, permiso_id, efecto)
    select p_usuario, x, 'conceder' from unnest(coalesce(p_conceder,'{}'::uuid[])) x
  on conflict do nothing;
  insert into public.usuarios_permisos (usuario_id, permiso_id, efecto)
    select p_usuario, x, 'revocar' from unnest(coalesce(p_revocar,'{}'::uuid[])) x
  on conflict (usuario_id, permiso_id) do update set efecto = 'revocar';
end $$;
grant execute on function public.fn_set_permisos_usuario(uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Lecturas para las pantallas.
-- ---------------------------------------------------------------------------
-- Roles con su conteo de permisos y de usuarios.
create or replace function public.app_listar_roles()
returns table(id uuid, codigo text, nombre text, descripcion text, es_sistema boolean, estado text,
              n_permisos bigint, n_usuarios bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.codigo, r.nombre, r.descripcion, r.es_sistema, r.estado,
    (select count(*) from public.roles_permisos rp where rp.rol_id = r.id),
    (select count(*) from public.perfiles p where p.rol_id = r.id and p.estado='activo')
  from public.roles r
  where public.soy_administrador() or public.tengo_permiso('roles.gestionar')
  order by r.es_sistema desc, r.nombre;
$$;
grant execute on function public.app_listar_roles() to authenticated;

-- Todos los permisos (catálogo) para armar los checkboxes agrupados por módulo.
create or replace function public.app_listar_permisos()
returns table(id uuid, modulo text, accion text, codigo text, descripcion text)
language sql stable security definer set search_path = public as $$
  select id, modulo, accion, codigo, descripcion from public.permisos
  where public.soy_administrador() or public.tengo_permiso('roles.gestionar') or public.tengo_permiso('usuarios.editar')
  order by modulo, accion;
$$;
grant execute on function public.app_listar_permisos() to authenticated;

-- IDs de permisos asignados a un rol.
create or replace function public.app_permisos_rol(p_rol uuid)
returns table(permiso_id uuid)
language sql stable security definer set search_path = public as $$
  select rp.permiso_id from public.roles_permisos rp
  where rp.rol_id = p_rol and (public.soy_administrador() or public.tengo_permiso('roles.gestionar'));
$$;
grant execute on function public.app_permisos_rol(uuid) to authenticated;

-- Overrides de un usuario (concedidos/revocados).
create or replace function public.app_permisos_usuario(p_usuario uuid)
returns table(permiso_id uuid, efecto text)
language sql stable security definer set search_path = public as $$
  select up.permiso_id, up.efecto from public.usuarios_permisos up
  where up.usuario_id = p_usuario
    and (public.soy_administrador() or public.tengo_permiso('usuarios.ver') or up.usuario_id = (select auth.uid()));
$$;
grant execute on function public.app_permisos_usuario(uuid) to authenticated;

do $$ begin raise notice 'roles + permisos por usuario listos.'; end $$;
