-- =============================================================================
-- Reclasificación del costo del mes por panadería (desecho). El Taller compra la
-- MP (51-10) y el prorrateo la reparte a cada panadería; ese costo total de la
-- panadería se RECLASIFICA (no se suma, no se dobla) en: costo de lo vendido +
-- merma + autoconsumo. El total del bloque = lo que compró la panadería, íntegro.
--   Debe 51-30-01-02 Merma                (del desecho, por centro)
--   Debe 51-30-01-01 Autoconsumo          (del desecho, por centro)
--   Debe 51-30-01-03 Costo de lo vendido  (compras − merma − autoconsumo)
--   Haber 51-10-01 Compras exentas        (saldo del centro en el mes)
--   Haber 51-10-02 Compras gravadas       (saldo del centro en el mes)
-- =============================================================================

create table public.reclasificacion_costo_mes (
  id              uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references public.centros_costo(id),
  periodo         date not null,           -- primer día del mes
  compras_total   numeric(18,2) not null,
  merma           numeric(18,2) not null default 0,
  autoconsumo     numeric(18,2) not null default 0,
  costo_vendido   numeric(18,2) not null default 0,
  estado          text not null default 'confirmado' check (estado in ('confirmado','anulado')),
  asiento_id      uuid references public.asientos(id),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  anulado_en      timestamptz, anulado_por uuid,
  actualizado_en  timestamptz, actualizado_por uuid
);
create unique index reclasif_costo_unica on public.reclasificacion_costo_mes (centro_costo_id, periodo) where estado <> 'anulado';
select public.fn_adjuntar_auditoria('public.reclasificacion_costo_mes');

create or replace function public.fn_postear_reclasificacion_costo(
  p_centro uuid, p_periodo date, p_merma numeric, p_autoconsumo numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ini date; v_fin date; v_id uuid; v_asiento uuid;
  v_exe numeric(18,2); v_gra numeric(18,2); v_tot numeric(18,2);
  v_me numeric(18,2); v_au numeric(18,2); v_ve numeric(18,2);
  v_c_me uuid; v_c_au uuid; v_c_ve uuid; v_c_ex uuid; v_c_gr uuid;
  v_lineas jsonb := '[]'::jsonb;
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'Elegí una panadería (Chepito 1 o 2).'; end if;
  v_ini := date_trunc('month', p_periodo)::date;
  v_fin := (v_ini + interval '1 month' - interval '1 day')::date;

  -- Saldos de compras del centro en el mes (excluye reversiones y la propia
  -- reclasificación, para tomar las compras brutas).
  select coalesce(sum(l.debito - l.credito), 0) into v_exe
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id join public.cuentas cu on cu.id = l.cuenta_id
   where cu.codigo = '51-10-01-00-00' and l.centro_costo_id = p_centro
     and a.estado = 'confirmado' and a.tipo <> 'reversion'
     and a.origen_tipo is distinct from 'reclasif_costo' and a.fecha between v_ini and v_fin;
  select coalesce(sum(l.debito - l.credito), 0) into v_gra
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id join public.cuentas cu on cu.id = l.cuenta_id
   where cu.codigo = '51-10-02-00-00' and l.centro_costo_id = p_centro
     and a.estado = 'confirmado' and a.tipo <> 'reversion'
     and a.origen_tipo is distinct from 'reclasif_costo' and a.fecha between v_ini and v_fin;
  v_exe := round(v_exe, 2); v_gra := round(v_gra, 2); v_tot := v_exe + v_gra;
  if v_tot <= 0 then raise exception 'No hay compras registradas para esa panadería en ese mes (prorrateá primero).'; end if;

  v_me := round(coalesce(p_merma, 0), 2); v_au := round(coalesce(p_autoconsumo, 0), 2);
  v_ve := round(v_tot - v_me - v_au, 2);
  if v_ve < 0 then raise exception 'La merma + autoconsumo (%) supera las compras del mes (%). Revisá.', v_me + v_au, v_tot; end if;

  select id into v_c_me from public.cuentas where codigo = '51-30-01-02-00';
  select id into v_c_au from public.cuentas where codigo = '51-30-01-01-00';
  select id into v_c_ve from public.cuentas where codigo = '51-30-01-03-00';
  select id into v_c_ex from public.cuentas where codigo = '51-10-01-00-00';
  select id into v_c_gr from public.cuentas where codigo = '51-10-02-00-00';

  insert into public.reclasificacion_costo_mes (centro_costo_id, periodo, compras_total, merma, autoconsumo, costo_vendido)
  values (p_centro, v_ini, v_tot, v_me, v_au, v_ve) returning id into v_id;

  if v_me > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_me, 'debito', v_me, 'centro_costo_id', p_centro, 'detalle','Merma'); end if;
  if v_au > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_au, 'debito', v_au, 'centro_costo_id', p_centro, 'detalle','Autoconsumo'); end if;
  if v_ve > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_ve, 'debito', v_ve, 'centro_costo_id', p_centro, 'detalle','Costo de lo vendido'); end if;
  if v_exe > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_ex, 'credito', v_exe, 'centro_costo_id', p_centro, 'detalle','Reclasif. compras exentas'); end if;
  if v_gra > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_gr, 'credito', v_gra, 'centro_costo_id', p_centro, 'detalle','Reclasif. compras gravadas'); end if;

  v_asiento := public.fn_postear_asiento('diario', v_fin, 'Reclasificación de costo del mes', 'reclasif_costo', v_id, v_lineas);
  update public.reclasificacion_costo_mes set asiento_id = v_asiento where id = v_id;
  return v_asiento;
end $$;
grant execute on function public.fn_postear_reclasificacion_costo(uuid, date, numeric, numeric) to authenticated;

create or replace function public.fn_anular_reclasificacion_costo(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  select estado into v_estado from public.reclasificacion_costo_mes where id = p_id;
  if v_estado is null then raise exception 'Reclasificación inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Ya está %.', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  perform public.fn_anular_asiento_auto('reclasif_costo', p_id, p_motivo);
  update public.reclasificacion_costo_mes set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_id;
end $$;
grant execute on function public.fn_anular_reclasificacion_costo(uuid, text) to authenticated;

alter table public.reclasificacion_costo_mes enable row level security;
create policy rcm_sel on public.reclasificacion_costo_mes for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));
create policy rcm_wr on public.reclasificacion_costo_mes for all to authenticated
  using (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'))
  with check (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));

do $$ begin raise notice 'reclasificacion_costo_mes lista.'; end $$;
