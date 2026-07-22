-- =============================================================================
-- 20260722120003_usuarios_roles_permisos.sql
-- Roles, permisos granulares, perfiles (extienden auth.users) y asignación de
-- usuarios a sucursales (define el alcance del RLS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles (cajero, bodeguero, contador, administrador...). Un usuario tiene un
-- rol para arrancar; el diseño roles<->permisos permite roles a medida.
-- -----------------------------------------------------------------------------
create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nombre          text not null,
  descripcion     text,
  es_sistema      boolean not null default false,
  estado          text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);

comment on table public.roles is 'Roles del sistema. es_sistema = true no se puede desactivar/anular desde la UI.';

-- -----------------------------------------------------------------------------
-- Permisos granulares por módulo + acción (ej. usuarios.crear).
-- -----------------------------------------------------------------------------
create table public.permisos (
  id          uuid primary key default gen_random_uuid(),
  modulo      text not null,
  accion      text not null,
  codigo      text not null unique,
  descripcion text,
  unique (modulo, accion)
);

comment on table public.permisos is 'Catálogo de permisos granulares. `codigo` = "modulo.accion".';

-- -----------------------------------------------------------------------------
-- Relación M:N roles <-> permisos.
-- -----------------------------------------------------------------------------
create table public.roles_permisos (
  rol_id     uuid not null references public.roles(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

-- -----------------------------------------------------------------------------
-- Perfiles: 1:1 con auth.users. Guarda datos de app (nombre, rol, estado).
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null default '',
  rol_id          uuid references public.roles(id),
  estado          text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);

comment on table public.perfiles is 'Extiende auth.users con datos de aplicación. estado inactivo = usuario anulado (nunca se borra).';

-- -----------------------------------------------------------------------------
-- Asignación de usuarios a sucursales. Define QUÉ ve y toca cada usuario (RLS).
-- -----------------------------------------------------------------------------
create table public.usuarios_sucursales (
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  primary key (usuario_id, sucursal_id)
);

comment on table public.usuarios_sucursales is 'Sucursales asignadas a cada usuario. Base del RLS por sucursal.';

create index usuarios_sucursales_sucursal_idx on public.usuarios_sucursales (sucursal_id);

-- -----------------------------------------------------------------------------
-- Al crear un usuario en Auth, crear su perfil automáticamente.
-- -----------------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre_completo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- -----------------------------------------------------------------------------
-- Audit trail en las tablas de entidad (las de PK compuesta se auditan por su
-- entidad padre; el detalle fino de asignaciones se ve en la propia tabla).
-- -----------------------------------------------------------------------------
select public.fn_adjuntar_auditoria('public.roles');
select public.fn_adjuntar_auditoria('public.perfiles');
