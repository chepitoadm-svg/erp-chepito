-- =============================================================================
-- Bitácora de tiempo de trabajo por "actividad real". Cada bloque contiguo de
-- actividad es una fila en `sesiones`: mientras el usuario usa el sistema, un
-- latido (cada ~1 min desde el navegador) mueve `ultima_actividad`. Si pasan
-- más de 30 min sin latido, el siguiente latido abre un bloque NUEVO — así el
-- tiempo que la pestaña quedó abierta sin usarse NO cuenta como trabajo.
-- El tiempo trabajado = suma de (ultima_actividad − inicio) de cada bloque.
-- =============================================================================

create table public.sesiones (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfiles(id) on delete cascade,
  inicio           timestamptz not null default now(),
  ultima_actividad timestamptz not null default now(),
  creado_en        timestamptz not null default now()
);
create index sesiones_usuario_act on public.sesiones (usuario_id, ultima_actividad desc);

alter table public.sesiones enable row level security;
create policy sesiones_sel on public.sesiones for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('auditoria.ver') or usuario_id = (select auth.uid()));
-- Sin políticas de insert/update: solo escribe la función SECURITY DEFINER.

-- Latido de actividad: extiende el bloque abierto o arranca uno nuevo si el
-- último latido fue hace más de 30 minutos.
create or replace function public.fn_latido_sesion()
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ult timestamptz; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return; end if;
  select id, ultima_actividad into v_id, v_ult
    from public.sesiones where usuario_id = v_uid
    order by ultima_actividad desc limit 1;
  if v_id is null or now() - v_ult > interval '30 minutes' then
    insert into public.sesiones (usuario_id, inicio, ultima_actividad) values (v_uid, now(), now());
  else
    update public.sesiones set ultima_actividad = now() where id = v_id;
  end if;
end $$;
grant execute on function public.fn_latido_sesion() to authenticated;

-- Reporte: cada bloque con su duración, en hora de Costa Rica. `activa` = el
-- bloque sigue vivo (último latido hace ≤ 30 min).
create or replace function public.app_reporte_sesiones(
  p_usuario uuid  default null,
  p_desde   date  default null,
  p_hasta   date  default null,
  p_limit   int   default 500
)
returns table(
  id uuid, usuario_id uuid, usuario_nombre text,
  dia date, dia_txt text, hora_inicio text, hora_fin text,
  duracion_min numeric, activa boolean, inicio timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.usuario_id, p.nombre_completo,
    (s.inicio at time zone 'America/Costa_Rica')::date as dia,
    to_char(s.inicio at time zone 'America/Costa_Rica', 'DD/MM/YYYY') as dia_txt,
    to_char(s.inicio at time zone 'America/Costa_Rica', 'HH24:MI') as hora_inicio,
    to_char(s.ultima_actividad at time zone 'America/Costa_Rica', 'HH24:MI') as hora_fin,
    round(extract(epoch from (s.ultima_actividad - s.inicio)) / 60.0)::numeric as duracion_min,
    (now() - s.ultima_actividad <= interval '30 minutes') as activa,
    s.inicio
  from public.sesiones s
  left join public.perfiles p on p.id = s.usuario_id
  where (public.soy_administrador() or public.tengo_permiso('auditoria.ver'))
    and (p_usuario is null or s.usuario_id = p_usuario)
    and (p_desde is null or (s.inicio at time zone 'America/Costa_Rica')::date >= p_desde)
    and (p_hasta is null or (s.inicio at time zone 'America/Costa_Rica')::date <= p_hasta)
  order by s.inicio desc
  limit greatest(1, least(coalesce(p_limit,500), 2000));
$$;
grant execute on function public.app_reporte_sesiones(uuid, date, date, int) to authenticated;

-- Usuarios que tienen sesiones registradas (para el filtro).
create or replace function public.app_sesiones_usuarios()
returns table(usuario_id uuid, nombre_completo text)
language sql stable security definer set search_path = public as $$
  select distinct s.usuario_id, p.nombre_completo
  from public.sesiones s left join public.perfiles p on p.id = s.usuario_id
  where public.soy_administrador() or public.tengo_permiso('auditoria.ver')
  order by 2;
$$;
grant execute on function public.app_sesiones_usuarios() to authenticated;

do $$ begin raise notice 'bitacora de sesiones lista.'; end $$;
