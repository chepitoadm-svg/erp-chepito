-- =============================================================================
-- Consulta del rastro de auditoría (tabla public.auditoria, ya poblada por los
-- triggers de 42 tablas). Expone una lectura filtrable por usuario, módulo/tabla
-- y rango de fechas, con el nombre del usuario resuelto. Exige 'auditoria.ver'.
-- =============================================================================

create or replace function public.app_listar_auditoria(
  p_usuario uuid  default null,
  p_tabla   text  default null,
  p_accion  text  default null,
  p_desde   date  default null,
  p_hasta   date  default null,
  p_limit   int   default 200,
  p_offset  int   default 0
)
returns table(
  id bigint, tabla text, registro_id text, accion text,
  usuario_id uuid, usuario_nombre text, usuario_email text,
  datos_antes jsonb, datos_despues jsonb, ocurrido_en timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.tabla, a.registro_id, a.accion,
    a.usuario_id, p.nombre_completo, u.email::text,
    a.datos_antes, a.datos_despues, a.ocurrido_en
  from public.auditoria a
  left join public.perfiles p on p.id = a.usuario_id
  left join auth.users u on u.id = a.usuario_id
  where (public.soy_administrador() or public.tengo_permiso('auditoria.ver'))
    and (p_usuario is null or a.usuario_id = p_usuario)
    and (p_tabla   is null or a.tabla = p_tabla)
    and (p_accion  is null or a.accion = p_accion)
    and (p_desde   is null or a.ocurrido_en >= p_desde::timestamptz)
    and (p_hasta   is null or a.ocurrido_en < (p_hasta + 1)::timestamptz)
  order by a.ocurrido_en desc, a.id desc
  limit greatest(1, least(coalesce(p_limit,200), 500))
  offset greatest(0, coalesce(p_offset,0));
$$;
grant execute on function public.app_listar_auditoria(uuid, text, text, date, date, int, int) to authenticated;

-- Lista de tablas presentes en la auditoría (para el filtro de módulo).
create or replace function public.app_auditoria_tablas()
returns table(tabla text, n bigint)
language sql stable security definer set search_path = public as $$
  select a.tabla, count(*) from public.auditoria a
  where public.soy_administrador() or public.tengo_permiso('auditoria.ver')
  group by a.tabla order by a.tabla;
$$;
grant execute on function public.app_auditoria_tablas() to authenticated;

-- Usuarios que aparecen en la auditoría (para el filtro de usuario).
create or replace function public.app_auditoria_usuarios()
returns table(usuario_id uuid, nombre_completo text)
language sql stable security definer set search_path = public as $$
  select distinct a.usuario_id, coalesce(p.nombre_completo, '(sistema)')
  from public.auditoria a
  left join public.perfiles p on p.id = a.usuario_id
  where (public.soy_administrador() or public.tengo_permiso('auditoria.ver'))
    and a.usuario_id is not null
  order by 2;
$$;
grant execute on function public.app_auditoria_usuarios() to authenticated;

do $$ begin raise notice 'consulta de auditoria lista.'; end $$;
