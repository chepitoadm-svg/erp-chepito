-- =============================================================================
-- FIX (auditoría): app_estado_prorrateo mostraba el POOL del centro intermedio
-- inflado por las reversiones de prorrateo, igual que pasaba en el Estado de
-- Resultados. El pool excluía los asientos tipo='prorrateo' pero no las
-- reversiones cuyo original era un prorrateo, así que cada regeneración lo
-- inflaba (Taller mostraba 3.857.123,26 en vez de 1.552.374,42).
--
-- No corrompía datos (la GENERACIÓN del prorrateo usa su propio cursor que
-- incluye todo y netea bien), pero el número mostrado engañaba. Se aplica la
-- misma exclusión de reversiones-de-prorrateo.
-- =============================================================================

create or replace function public.app_estado_prorrateo(p_periodo uuid)
returns table (
  centro_id          uuid,
  codigo             text,
  nombre             text,
  requiere_prorrateo boolean,
  pool               numeric(18,2),
  suma_bases         numeric(9,4),
  bases              jsonb
)
language sql
stable
security invoker
as $$
  select
    c.id, c.codigo, c.nombre, c.requiere_prorrateo,
    coalesce((
      select sum(l.debito) - sum(l.credito)
        from public.asientos_lineas l
        join public.asientos a on a.id = l.asiento_id
       where a.estado in ('confirmado', 'anulado')
         and a.periodo_id = p_periodo
         and l.centro_costo_id = c.id
         -- Ignora el prorrateo Y sus reversiones (mismo criterio que el Estado
         -- de Resultados "sin prorrateo"): el pool es el gasto bruto del centro.
         and a.tipo <> 'prorrateo'
         and not (
           a.tipo = 'reversion'
           and exists (
             select 1
               from public.asientos_anulaciones an
               join public.asientos ao on ao.id = an.asiento_id
              where an.asiento_reversion_id = a.id and ao.tipo = 'prorrateo'
           )
         )
    ), 0)::numeric(18,2),
    coalesce((
      select sum(b.porcentaje) from public.prorrateo_bases b
       where b.periodo_id = p_periodo and b.centro_origen_id = c.id
    ), 0)::numeric(9,4),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'centro_destino_id', b.centro_destino_id,
        'destino_codigo', d.codigo,
        'porcentaje', b.porcentaje
      ) order by d.codigo)
        from public.prorrateo_bases b
        join public.centros_costo d on d.id = b.centro_destino_id
       where b.periodo_id = p_periodo and b.centro_origen_id = c.id
    ), '[]'::jsonb)
  from public.centros_costo c
  where c.activo and c.tipo = 'intermedio'
  order by c.codigo;
$$;

do $$ begin raise notice 'app_estado_prorrateo: pool ya no cuenta reversiones de prorrateo.'; end $$;
