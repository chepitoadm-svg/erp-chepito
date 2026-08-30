-- =============================================================================
-- Ajuste: la reclasificación del costo toma el COSTO NETO del centro = compras
-- (51-10) MENOS devoluciones de compras (51-20-02). Antes solo tomaba compras y
-- sobraban las devoluciones. Ahora reclasifica TODAS las cuentas de costo del
-- centro (las deja en cero) y el bloque 51-30 = costo neto, que calza exacto con
-- el "Total costo de ventas" del Estado de Resultados.
-- =============================================================================

create or replace function public.fn_postear_reclasificacion_costo(
  p_centro uuid, p_periodo date, p_merma numeric, p_autoconsumo numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ini date; v_fin date; v_id uuid; v_asiento uuid;
  v_tot numeric(18,2) := 0; v_n numeric(18,2);
  v_me numeric(18,2); v_au numeric(18,2); v_ve numeric(18,2);
  v_c_me uuid; v_c_au uuid; v_c_ve uuid;
  v_lineas jsonb := '[]'::jsonb; r record;
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'Elegí una panadería (Chepito 1 o 2).'; end if;
  v_ini := date_trunc('month', p_periodo)::date;
  v_fin := (v_ini + interval '1 month' - interval '1 day')::date;

  -- Cada cuenta de costo del centro (compras 51-10 y devoluciones 51-20-02) con
  -- saldo <> 0: se pone en cero con la línea opuesta, y su neto entra al bloque.
  for r in
    select l.cuenta_id, round(coalesce(sum(l.debito - l.credito), 0), 2) neto
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
      join public.cuentas cu on cu.id = l.cuenta_id
     where l.centro_costo_id = p_centro
       and (cu.codigo like '51-10-%' or cu.codigo like '51-20-02-%')
       and a.estado = 'confirmado' and a.tipo <> 'reversion'
       and a.origen_tipo is distinct from 'reclasif_costo'
       and a.fecha between v_ini and v_fin
     group by l.cuenta_id
    having round(coalesce(sum(l.debito - l.credito), 0), 2) <> 0
  loop
    v_n := r.neto; v_tot := v_tot + v_n;
    if v_n > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', r.cuenta_id, 'credito', v_n, 'centro_costo_id', p_centro, 'detalle','Reclasif. de costo');
    else
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', r.cuenta_id, 'debito', -v_n, 'centro_costo_id', p_centro, 'detalle','Reclasif. de costo');
    end if;
  end loop;
  v_tot := round(v_tot, 2);
  if v_tot <= 0 then raise exception 'No hay costo de compras para esa panadería en ese mes (prorrateá primero).'; end if;

  v_me := round(coalesce(p_merma, 0), 2); v_au := round(coalesce(p_autoconsumo, 0), 2);
  v_ve := round(v_tot - v_me - v_au, 2);
  if v_ve < 0 then raise exception 'La merma + autoconsumo (%) supera el costo neto del mes (%). Revisá.', v_me + v_au, v_tot; end if;

  select id into v_c_me from public.cuentas where codigo = '51-30-01-02-00';
  select id into v_c_au from public.cuentas where codigo = '51-30-01-01-00';
  select id into v_c_ve from public.cuentas where codigo = '51-30-01-03-00';

  insert into public.reclasificacion_costo_mes (centro_costo_id, periodo, compras_total, merma, autoconsumo, costo_vendido)
  values (p_centro, v_ini, v_tot, v_me, v_au, v_ve) returning id into v_id;

  if v_me > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_me, 'debito', v_me, 'centro_costo_id', p_centro, 'detalle','Merma'); end if;
  if v_au > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_au, 'debito', v_au, 'centro_costo_id', p_centro, 'detalle','Autoconsumo'); end if;
  if v_ve > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_ve, 'debito', v_ve, 'centro_costo_id', p_centro, 'detalle','Costo de lo vendido'); end if;

  v_asiento := public.fn_postear_asiento('diario', v_fin, 'Reclasificación de costo del mes', 'reclasif_costo', v_id, v_lineas);
  update public.reclasificacion_costo_mes set asiento_id = v_asiento where id = v_id;
  return v_asiento;
end $$;
grant execute on function public.fn_postear_reclasificacion_costo(uuid, date, numeric, numeric) to authenticated;

do $$ begin raise notice 'reclasificación con costo NETO (compras − devoluciones).'; end $$;
