-- =============================================================================
-- Cierre de MP del mes: pasa de "costo teórico por centro" a
-- "MP COMPRADA real, prorrateada a las panaderías por su consumo".
-- Modelo del negocio: toda la MP se compra/ingresa en el TALLER; CH1/CH2 son
-- despachos. El costo real de cada panadería = MP comprada del mes × la
-- participación de cada una en el consumo (según el app de costos). Y el
-- control anti-robo = MP comprada (real) vs MP consumida teórica.
--   Debe  51-30-01-03 Costo de ventas (centro CH1/CH2/VEX)  [comprada×share]
--   Haber 11-60-01 Inventario                               [total comprado]
-- Se guarda el consumo teórico (total y por centro) para mostrar la alarma.
-- =============================================================================

alter table public.costo_produccion_mes
  add column if not exists consumo_teorico numeric(18,2) not null default 0;
alter table public.costo_produccion_mes_lineas
  add column if not exists consumo_teorico numeric(18,2) not null default 0;

-- Recreo el alta con el consumo teórico (header) y por línea.
drop function if exists public.fn_crear_costo_mes(date, jsonb);
create or replace function public.fn_crear_costo_mes(
  p_periodo date, p_consumo_teorico numeric, p_lineas jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric(18,2) := 0; r jsonb; v_centro uuid; v_monto numeric(18,2);
begin
  perform public.fn_exigir_permiso('costos.registrar');
  if p_periodo is null then raise exception 'Falta el mes.'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay montos de costo para registrar.'; end if;

  insert into public.costo_produccion_mes (periodo, consumo_teorico)
  values (date_trunc('month', p_periodo)::date, round(coalesce(p_consumo_teorico,0),2))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    v_centro := (r->>'centro_costo_id')::uuid;
    v_monto  := round((r->>'monto')::numeric, 2);
    if not exists (select 1 from public.centros_costo where id = v_centro and activo) then
      raise exception 'Centro de costo inválido en el costo del mes.'; end if;
    if v_monto <= 0 then continue; end if;
    insert into public.costo_produccion_mes_lineas (mes_id, centro_costo_id, monto, unidades_sin_receta, consumo_teorico)
    values (v_id, v_centro, v_monto, round(coalesce((r->>'sin_receta')::numeric, 0), 2),
            round(coalesce((r->>'consumo_teorico')::numeric, 0), 2));
    v_total := v_total + v_monto;
  end loop;

  if v_total <= 0 then raise exception 'El costo del mes no tiene monto (¿hay MP comprada ese mes?).'; end if;
  update public.costo_produccion_mes set total = v_total where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_costo_mes(date, numeric, jsonb) to authenticated;

do $$ begin raise notice 'cierre MP prorrateo listo.'; end $$;
