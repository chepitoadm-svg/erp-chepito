-- =============================================================================
-- Funciones de aplicación para la UI de asientos.
--
-- Crear/editar un asiento son operaciones MULTI-LÍNEA que deben ser atómicas:
-- si una línea falla, no puede quedar media cabecera. supabase-js hace cada
-- .insert() en su propia transacción, así que se envuelve todo en una función
-- (una transacción). SECURITY INVOKER: corre con la identidad y los permisos
-- del usuario, sujeto a RLS.
-- =============================================================================

-- === CREAR ==================================================================
-- p_lineas: jsonb array de {cuenta_id, centro_costo_id, debito, credito,
--           moneda, tipo_cambio, monto_original, detalle}
create or replace function public.app_crear_asiento(
  p_tipo      text,
  p_fecha     date,
  p_glosa     text,
  p_lineas    jsonb,
  p_confirmar boolean default false
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id     uuid;
  v_linea  jsonb;
  v_n      int := 0;
begin
  insert into public.asientos (tipo, fecha, glosa)
  values (p_tipo, p_fecha, p_glosa)
  returning id into v_id;

  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_n := v_n + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id,
       debito, credito, moneda, tipo_cambio, monto_original, detalle)
    values (
      v_id, v_n,
      (v_linea->>'cuenta_id')::uuid,
      nullif(v_linea->>'centro_costo_id', '')::uuid,
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      coalesce(v_linea->>'moneda', 'CRC'),
      coalesce((v_linea->>'tipo_cambio')::numeric, 1),
      coalesce((v_linea->>'monto_original')::numeric,
               coalesce((v_linea->>'debito')::numeric, 0) + coalesce((v_linea->>'credito')::numeric, 0)),
      nullif(v_linea->>'detalle', '')
    );
  end loop;

  if p_confirmar then
    update public.asientos set estado = 'confirmado' where id = v_id;
  end if;

  return v_id;
end;
$$;

-- === EDITAR UN BORRADOR =====================================================
-- Solo toca borradores (el trigger de inmutabilidad rechaza lo demás). Reemplaza
-- por completo el set de líneas.
create or replace function public.app_actualizar_asiento(
  p_id        uuid,
  p_tipo      text,
  p_fecha     date,
  p_glosa     text,
  p_lineas    jsonb,
  p_confirmar boolean default false
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_estado text;
  v_linea  jsonb;
  v_n      int := 0;
begin
  select estado into v_estado from public.asientos where id = p_id;
  if v_estado is null then
    raise exception 'El asiento no existe o no tenés acceso.';
  end if;
  if v_estado <> 'borrador' then
    raise exception 'Solo se edita un asiento en borrador (está %).', v_estado;
  end if;

  update public.asientos
     set tipo = p_tipo, fecha = p_fecha, glosa = p_glosa
   where id = p_id;

  delete from public.asientos_lineas where asiento_id = p_id;

  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_n := v_n + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id,
       debito, credito, moneda, tipo_cambio, monto_original, detalle)
    values (
      p_id, v_n,
      (v_linea->>'cuenta_id')::uuid,
      nullif(v_linea->>'centro_costo_id', '')::uuid,
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      coalesce(v_linea->>'moneda', 'CRC'),
      coalesce((v_linea->>'tipo_cambio')::numeric, 1),
      coalesce((v_linea->>'monto_original')::numeric,
               coalesce((v_linea->>'debito')::numeric, 0) + coalesce((v_linea->>'credito')::numeric, 0)),
      nullif(v_linea->>'detalle', '')
    );
  end loop;

  if p_confirmar then
    update public.asientos set estado = 'confirmado' where id = p_id;
  end if;

  return p_id;
end;
$$;

-- === LISTADO ================================================================
-- Cabecera + totales, con filtros opcionales. El total sale de las líneas.
create or replace function public.app_listar_asientos(
  p_estado  text default null,
  p_periodo uuid default null,
  p_limite  int  default 100
)
returns table (
  id             uuid,
  tipo           text,
  numero         int,
  fecha          date,
  glosa          text,
  estado         text,
  anio           int,
  mes            int,
  total          numeric,
  n_lineas       int
)
language sql
stable
security invoker
as $$
  select a.id, a.tipo, a.numero, a.fecha, a.glosa, a.estado, p.anio, p.mes,
         coalesce((select sum(l.debito) from public.asientos_lineas l where l.asiento_id = a.id), 0),
         (select count(*)::int from public.asientos_lineas l where l.asiento_id = a.id)
    from public.asientos a
    join public.periodos_contables p on p.id = a.periodo_id
   where (p_estado  is null or a.estado = p_estado)
     and (p_periodo is null or a.periodo_id = p_periodo)
   order by a.fecha desc, a.creado_en desc
   limit greatest(p_limite, 1);
$$;

-- === DETALLE ================================================================
create or replace function public.app_obtener_asiento(p_id uuid)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'id', a.id, 'tipo', a.tipo, 'numero', a.numero, 'fecha', a.fecha,
    'glosa', a.glosa, 'estado', a.estado,
    'periodo_id', a.periodo_id, 'anio', p.anio, 'mes', p.mes, 'periodo_estado', p.estado,
    'creado_en', a.creado_en, 'confirmado_en', a.confirmado_en, 'anulado_en', a.anulado_en,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea', l.linea,
        'cuenta_id', l.cuenta_id,
        'cuenta_codigo', c.codigo,
        'cuenta_nombre', c.nombre,
        'centro_costo_id', l.centro_costo_id,
        'centro_codigo', cc.codigo,
        'debito', l.debito, 'credito', l.credito,
        'moneda', l.moneda, 'tipo_cambio', l.tipo_cambio, 'monto_original', l.monto_original,
        'detalle', l.detalle
      ) order by l.linea)
      from public.asientos_lineas l
      join public.cuentas c on c.id = l.cuenta_id
      left join public.centros_costo cc on cc.id = l.centro_costo_id
      where l.asiento_id = a.id
    ), '[]'::jsonb),
    'anulacion', (
      select jsonb_build_object('reversion_id', an.asiento_reversion_id,
                                'motivo', an.motivo, 'fecha_reversion', an.fecha_reversion)
        from public.asientos_anulaciones an where an.asiento_id = a.id
    )
  )
  from public.asientos a
  join public.periodos_contables p on p.id = a.periodo_id
  where a.id = p_id;
$$;

do $$
begin
  raise notice 'Funciones de app para asientos listas.';
end $$;
