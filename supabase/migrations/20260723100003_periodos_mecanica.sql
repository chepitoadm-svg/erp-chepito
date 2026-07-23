-- =============================================================================
-- Mecánica de periodos contables.
--
-- La tabla periodos_contables ya existe desde la Fase 1. Acá se agrega:
--   - generación automática de los 12 meses de un año
--   - resolución de la fecha contable -> periodo (la usa el trigger de asientos)
--   - rastro de reapertura
--
-- NOTA: la validación de "no se cierra un periodo con asientos en borrador"
-- vive en la migración de cierre, DESPUÉS de que exista la tabla asientos.
-- Acá no se puede referenciar todavía.
-- =============================================================================

-- === RASTRO DE REAPERTURA ===================================================
-- Reabrir un periodo cerrado es excepcional y debe quedar registrado. El
-- trigger de auditoría ya captura el UPDATE, pero estas columnas permiten
-- consultarlo directo sin escarbar la tabla auditoria.
alter table public.periodos_contables
  add column if not exists reabierto_por    uuid,
  add column if not exists reabierto_en     timestamptz,
  add column if not exists veces_reabierto  int not null default 0;

comment on column public.periodos_contables.veces_reabierto is
  'Cuántas veces se reabrió tras haberse cerrado. Un valor alto es señal de '
  'problemas de proceso y es de lo primero que mira un auditor.';

-- === GENERACIÓN DE PERIODOS =================================================
-- Los periodos son mensuales. Se generan por año de un solo golpe en vez de
-- crearlos a mano, que es donde se cuelan meses faltantes o fechas mal puestas.
create or replace function public.fn_generar_periodos(p_anio int)
returns int
language plpgsql
as $$
declare
  v_mes    int;
  v_inicio date;
  v_creados int := 0;
begin
  if p_anio < 2000 or p_anio > 2100 then
    raise exception 'Año fuera de rango razonable: %', p_anio;
  end if;

  for v_mes in 1..12 loop
    v_inicio := make_date(p_anio, v_mes, 1);
    insert into public.periodos_contables (anio, mes, fecha_inicio, fecha_fin, estado)
    values (
      p_anio,
      v_mes,
      v_inicio,
      (v_inicio + interval '1 month - 1 day')::date,
      'abierto'
    )
    on conflict (anio, mes) do nothing;
    if found then v_creados := v_creados + 1; end if;
  end loop;

  return v_creados;
end;
$$;

comment on function public.fn_generar_periodos(int) is
  'Crea los 12 periodos mensuales de un año. Idempotente.';

-- === FECHA CONTABLE -> PERIODO ==============================================
-- La fecha del asiento es DATE (nunca timestamptz): Costa Rica es UTC-6 y una
-- venta de las 7pm del 30 de junio caería en julio si se calculara en UTC.
create or replace function public.fn_periodo_de_fecha(p_fecha date)
returns uuid
language sql
stable
as $$
  select id
    from public.periodos_contables
   where p_fecha between fecha_inicio and fecha_fin
   limit 1;
$$;

comment on function public.fn_periodo_de_fecha(date) is
  'Resuelve el periodo contable que contiene una fecha. Devuelve null si no '
  'existe el periodo (el trigger de asientos lo trata como error).';

-- === PERIODOS DEL ARRANQUE ==================================================
-- El corte de la contabilidad es el 30/06/2026: el asiento de apertura va con
-- esa fecha, y julio 2026 arranca desde cero. Junio se abre SOLO para la
-- apertura y se cierra de inmediato después (operación manual, no acá).
select public.fn_generar_periodos(2026);
select public.fn_generar_periodos(2027);

do $$
declare v_2026 int; v_jun text;
begin
  select count(*) into v_2026 from public.periodos_contables where anio = 2026;
  select estado into v_jun from public.periodos_contables where anio = 2026 and mes = 6;
  raise notice 'Periodos 2026: % | junio 2026: % (se cierra tras la apertura).', v_2026, v_jun;
end $$;
