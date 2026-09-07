-- =============================================================================
-- app_cierre_detalle expone también centro_id, para armar enlaces filtrados por
-- centro (ej. "Ver ventas del mes" del cierre → /ventas del centro correcto).
-- =============================================================================

drop function if exists public.app_cierre_detalle(integer, integer);
create function public.app_cierre_detalle(p_anio integer, p_mes integer)
returns table(
  item_id uuid, requisito_id uuid, codigo text, nombre text, grupo text, orden integer,
  alcance text, auto_fuente text, requiere_archivo boolean,
  centro_id uuid, centro_codigo text, cuenta_id uuid, cuenta_codigo text, cuenta_nombre text,
  estado_manual text, nota text,
  auto_listo boolean, auto_n integer, auto_monto numeric, auto_detalle text,
  estado_efectivo text, n_archivos integer
)
language sql stable security definer set search_path = public as $$
  with m as (select id, make_date(p_anio,p_mes,1) ini, (make_date(p_anio,p_mes,1)+interval '1 month'-interval '1 day')::date fin
             from public.cierre_mes where anio=p_anio and mes=p_mes)
  select
    i.id, r.id, r.codigo, r.nombre, r.grupo, r.orden,
    r.alcance, r.auto_fuente, r.requiere_archivo,
    i.centro_id, cc.codigo, i.cuenta_id, cu.codigo, cu.nombre,
    i.estado, i.nota,
    a.listo, a.n, a.monto, a.detalle,
    case
      when i.estado = 'na' then 'na'
      when r.auto_fuente is not null then case when a.listo then 'listo' else 'pendiente' end
      else i.estado
    end as estado_efectivo,
    (select count(*)::int from public.cierre_archivo af where af.item_id = i.id and af.estado='activo')
  from m
  join public.cierre_item i on i.cierre_id = m.id
  join public.cierre_requisito r on r.id = i.requisito_id
  left join public.centros_costo cc on cc.id = i.centro_id
  left join public.cuentas cu on cu.id = i.cuenta_id
  left join lateral public.fn_cierre_auto(r.auto_fuente, m.ini, m.fin, i.centro_id, i.cuenta_id) a on true
  where public.soy_administrador() or public.tengo_permiso('cierre.gestionar')
  order by r.orden, cc.codigo nulls first, cu.codigo nulls first;
$$;
grant execute on function public.app_cierre_detalle(integer, integer) to authenticated;

do $$ begin raise notice 'app_cierre_detalle con centro_id listo.'; end $$;
