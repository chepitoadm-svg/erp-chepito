-- =============================================================================
-- Funciones de apoyo para las pantallas de administración contable:
-- periodos, prorrateo y sus estados.
-- =============================================================================

-- === PERIODOS: estado operativo ============================================
-- Lista los periodos con lo que hace falta saber para cerrarlos: cuántos
-- borradores quedan y qué pools exigen bases y no las tienen.
create or replace function public.app_listar_periodos(p_anio int default null)
returns table (
  id             uuid,
  anio           int,
  mes            int,
  fecha_inicio   date,
  fecha_fin      date,
  estado         text,
  n_borradores   int,
  pools_sin_bases text
)
language sql
stable
security invoker
as $$
  select
    p.id, p.anio, p.mes, p.fecha_inicio, p.fecha_fin, p.estado,
    (select count(*)::int from public.asientos a
      where a.periodo_id = p.id and a.estado = 'borrador'),
    (select string_agg(c.codigo, ', ' order by c.codigo)
       from public.centros_costo c
      where c.activo and c.requiere_prorrateo
        and not exists (select 1 from public.prorrateo_bases b
                         where b.centro_origen_id = c.id and b.periodo_id = p.id))
  from public.periodos_contables p
  where (p_anio is null or p.anio = p_anio)
  order by p.anio, p.mes;
$$;

-- === PRORRATEO: estado por periodo =========================================
-- Para cada centro INTERMEDIO activo: cuánto acumuló (el pool), si tiene bases
-- cargadas y cuánto suman, y las bases mismas.
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
       where a.estado = 'confirmado'
         and a.periodo_id = p_periodo
         and a.tipo <> 'prorrateo'
         and l.centro_costo_id = c.id
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

-- === GUARDAR BASES (atómico) ================================================
-- Reemplaza por completo las bases de (periodo, origen). Atómico: borra e
-- inserta en una transacción, y el constraint trigger diferido valida que la
-- suma dé exactamente 100 al COMMIT.
-- p_bases: jsonb array de {centro_destino_id, porcentaje}
create or replace function public.app_guardar_bases_prorrateo(
  p_periodo uuid,
  p_origen  uuid,
  p_bases   jsonb
)
returns void
language plpgsql
security invoker
as $$
declare v_b jsonb;
begin
  perform public.fn_exigir_permiso('prorrateo.gestionar');

  delete from public.prorrateo_bases
   where periodo_id = p_periodo and centro_origen_id = p_origen;

  for v_b in select * from jsonb_array_elements(coalesce(p_bases, '[]'::jsonb))
  loop
    insert into public.prorrateo_bases
      (periodo_id, centro_origen_id, centro_destino_id, porcentaje)
    values (
      p_periodo, p_origen,
      (v_b->>'centro_destino_id')::uuid,
      (v_b->>'porcentaje')::numeric
    );
  end loop;
end;
$$;

do $$
begin
  raise notice 'Funciones de administración (periodos, prorrateo) listas.';
end $$;
