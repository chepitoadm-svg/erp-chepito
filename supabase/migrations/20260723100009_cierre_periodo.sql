-- =============================================================================
-- Cierre y reapertura de periodos.
--
-- Vive acá y no en la migración de periodos porque necesita que existan
-- asientos y prorrateo_bases para poder validarlos.
-- =============================================================================

-- Exige un permiso salvo en contexto de servidor (service_role: auth.uid() es
-- NULL). Ahí el posteo automático ya validó permisos en la Server Action, igual
-- que en Fase 1.
create or replace function public.fn_exigir_permiso(p_codigo text)
returns void
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.tengo_permiso(p_codigo) then
    raise exception 'No tenés permiso: se requiere "%".', p_codigo;
  end if;
end;
$$;

create or replace function public.fn_cerrar_periodo(p_periodo_id uuid)
returns void
language plpgsql
as $$
declare
  v_estado     text;
  v_anio       int;
  v_mes        int;
  v_borradores int;
  v_pools      text;
begin
  perform public.fn_exigir_permiso('periodos.cerrar');

  select estado, anio, mes into v_estado, v_anio, v_mes
    from public.periodos_contables where id = p_periodo_id;

  if v_estado is null then
    raise exception 'Periodo % inexistente.', p_periodo_id;
  end if;
  if v_estado <> 'abierto' then
    raise exception 'El periodo %-% ya está %.', v_anio, v_mes, v_estado;
  end if;

  -- 1. No se cierra un periodo con asientos a medias. Hay que confirmarlos o
  --    descartarlos: un borrador colgando es trabajo sin resolver, no un dato.
  select count(*) into v_borradores
    from public.asientos
   where periodo_id = p_periodo_id and estado = 'borrador';

  if v_borradores > 0 then
    raise exception
      'El periodo %-% tiene % asiento(s) en borrador. Confirmalos o descartalos antes de cerrar.',
      v_anio, v_mes, v_borradores;
  end if;

  -- 2. Todo pool marcado como "se reparte" debe tener sus bases del periodo.
  --    Sin esto, un olvido se vería idéntico a una decisión y pasaría en silencio.
  select string_agg(c.codigo || ' (' || c.nombre || ')', ', ' order by c.codigo)
    into v_pools
    from public.centros_costo c
   where c.activo
     and c.requiere_prorrateo
     and not exists (
       select 1 from public.prorrateo_bases b
        where b.centro_origen_id = c.id and b.periodo_id = p_periodo_id
     );

  if v_pools is not null then
    raise exception
      'El periodo %-% no se puede cerrar: los siguientes centros exigen prorrateo y '
      'no tienen bases cargadas para el periodo: %.', v_anio, v_mes, v_pools;
  end if;

  update public.periodos_contables
     set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
   where id = p_periodo_id;
end;
$$;

comment on function public.fn_cerrar_periodo(uuid) is
  'Cierra un periodo. Falla si quedan borradores o si un pool con '
  'requiere_prorrateo no tiene bases cargadas.';

-- === REAPERTURA =============================================================
-- Excepcional y siempre registrada. veces_reabierto alto es señal de problemas
-- de proceso y es de lo primero que mira un auditor.
create or replace function public.fn_reabrir_periodo(p_periodo_id uuid)
returns void
language plpgsql
as $$
declare v_estado text; v_anio int; v_mes int;
begin
  perform public.fn_exigir_permiso('periodos.reabrir');

  select estado, anio, mes into v_estado, v_anio, v_mes
    from public.periodos_contables where id = p_periodo_id;

  if v_estado is null then
    raise exception 'Periodo % inexistente.', p_periodo_id;
  end if;
  if v_estado = 'bloqueado' then
    raise exception 'El periodo %-% está BLOQUEADO: no se reabre.', v_anio, v_mes;
  end if;
  if v_estado <> 'cerrado' then
    raise exception 'El periodo %-% no está cerrado (está %).', v_anio, v_mes, v_estado;
  end if;

  update public.periodos_contables
     set estado          = 'abierto',
         reabierto_por   = auth.uid(),
         reabierto_en    = now(),
         veces_reabierto = veces_reabierto + 1
   where id = p_periodo_id;
end;
$$;

do $$
begin
  raise notice 'Cierre y reapertura de periodo listos.';
end $$;
