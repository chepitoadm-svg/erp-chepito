-- =============================================================================
-- Liquidación de datafono (Credomatic/BAC). Se sube el TXT del mes por sucursal.
-- El banco: de la FACTURACIÓN de tarjetas te descuenta comisión, servicios y
-- retenciones (IVA y renta) y te deposita el NETO. Ese asiento CIERRA el datafono
-- (la cuenta por cobrar de las tarjetas del POS). La diferencia entre lo que el
-- procesador facturó y lo que el POS registró va a "Diferencias voucher" para que
-- el datafono quede limpio.
--   Debe 11-10-15-04-01 Banco             (neto depositado)
--   Debe 62-02-03 Comisiones voucher      (comisión + ajuste int + IVA ajustes)  [centro]
--   Debe 62-02-05 Ajustes cobrados        (servicios: term/mantenim/asistencia)  [centro]
--   Debe 11-30-03-01 Retención de IVA     (IVA retenido)
--   Debe 21-10-15-02 Retenciones Renta    (renta retenida)
--   Haber 11-30-02-01 Datafono            (tarjetas del POS → cierra por cobrar)
--   +/- 11-30-02-05 Diferencias voucher   (POS vs procesador, para cuadrar)
-- =============================================================================

create table public.liquidaciones_datafono (
  id             uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references public.centros_costo(id),
  periodo        date not null,                 -- primer día del mes
  facturacion    numeric(18,2) not null,        -- lo que el procesador facturó
  comision       numeric(18,2) not null default 0,  -- comisión + ajuste int + IVA ajustes
  servicios      numeric(18,2) not null default 0,  -- ajustes cobrados (servicios)
  ret_iva        numeric(18,2) not null default 0,
  ret_renta      numeric(18,2) not null default 0,
  neto_banco     numeric(18,2) not null default 0,  -- lo depositado
  pos_tarjeta    numeric(18,2) not null default 0,  -- tarjetas registradas por el POS
  diferencia     numeric(18,2) not null default 0,  -- a Diferencias voucher (firmado)
  estado         text not null default 'confirmado' check (estado in ('confirmado','anulado')),
  asiento_id     uuid references public.asientos(id),
  glosa          text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create unique index liquidaciones_datafono_unica on public.liquidaciones_datafono (centro_costo_id, periodo) where estado <> 'anulado';
select public.fn_adjuntar_auditoria('public.liquidaciones_datafono');
create trigger trg_liq_datafono_no_delete before delete on public.liquidaciones_datafono
  for each row execute function public.fn_bloquear_delete();

-- Registra y postea la liquidación en un solo paso (idempotente por origen).
create or replace function public.fn_registrar_liquidacion_datafono(
  p_centro uuid, p_periodo date,
  p_comision numeric, p_servicios numeric, p_ret_iva numeric, p_ret_renta numeric,
  p_neto_banco numeric, p_pos_tarjeta numeric, p_facturacion numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_com numeric(18,2); v_ser numeric(18,2); v_ri numeric(18,2); v_rr numeric(18,2);
  v_net numeric(18,2); v_pos numeric(18,2); v_deb numeric(18,2); v_dif numeric(18,2);
  v_cta_banco uuid; v_cta_com uuid; v_cta_ser uuid; v_cta_ri uuid; v_cta_rr uuid; v_cta_dat uuid; v_cta_dif uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'Elegí un negocio (Chepito 1 o 2).'; end if;

  v_com := round(coalesce(p_comision,0),2); v_ser := round(coalesce(p_servicios,0),2);
  v_ri := round(coalesce(p_ret_iva,0),2);  v_rr := round(coalesce(p_ret_renta,0),2);
  v_net := round(coalesce(p_neto_banco,0),2); v_pos := round(coalesce(p_pos_tarjeta,0),2);
  v_deb := round(v_net + v_com + v_ser + v_ri + v_rr, 2);
  v_dif := round(v_deb - v_pos, 2);   -- >0 = procesador facturó más que el POS (Haber dif)

  select id into v_cta_banco from public.cuentas where codigo = '11-10-15-04-01';
  select id into v_cta_com   from public.cuentas where codigo = '62-02-03-00-00';
  select id into v_cta_ser   from public.cuentas where codigo = '62-02-05-00-00';
  select id into v_cta_ri    from public.cuentas where codigo = '11-30-03-01-00';
  select id into v_cta_rr    from public.cuentas where codigo = '21-10-15-02-01';
  select id into v_cta_dat   from public.cuentas where codigo = '11-30-02-01-00';
  select id into v_cta_dif   from public.cuentas where codigo = '11-30-02-05-00';

  insert into public.liquidaciones_datafono
    (centro_costo_id, periodo, facturacion, comision, servicios, ret_iva, ret_renta, neto_banco, pos_tarjeta, diferencia, glosa)
  values (p_centro, date_trunc('month', p_periodo)::date, round(coalesce(p_facturacion,0),2),
          v_com, v_ser, v_ri, v_rr, v_net, v_pos, v_dif, 'Liquidación datafono')
  returning id into v_id;

  -- Débitos (cómo se repartió la facturación)
  if v_net > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_banco, 'debito', v_net, 'detalle','Neto depositado'); end if;
  if v_com > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_com, 'debito', v_com, 'centro_costo_id', p_centro, 'detalle','Comisión datafono'); end if;
  if v_ser > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_ser, 'debito', v_ser, 'centro_costo_id', p_centro, 'detalle','Servicios datafono'); end if;
  if v_ri  > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_ri, 'debito', v_ri, 'detalle','Retención IVA'); end if;
  if v_rr  > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_rr, 'debito', v_rr, 'detalle','Retención renta'); end if;
  -- Crédito: cierra el datafono por las tarjetas del POS
  if v_pos > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dat, 'credito', v_pos, 'detalle','Cierre tarjetas POS'); end if;
  -- Diferencia POS vs procesador
  if v_dif > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dif, 'credito', v_dif, 'detalle','Diferencia voucher');
  elsif v_dif < 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dif, 'debito', -v_dif, 'detalle','Diferencia voucher'); end if;

  v_asiento := public.fn_postear_asiento('ingreso',
                                         (date_trunc('month', p_periodo)::date + interval '1 month' - interval '1 day')::date,
                                         'Liquidación datafono', 'liquidacion_datafono', v_id, v_lineas);
  update public.liquidaciones_datafono set asiento_id = v_asiento where id = v_id;
  return v_asiento;
end $$;
grant execute on function public.fn_registrar_liquidacion_datafono(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Anular
create or replace function public.fn_anular_liquidacion_datafono(p_liq uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.liquidaciones_datafono where id = p_liq;
  if v_estado is null then raise exception 'Liquidación inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula una confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  perform public.fn_anular_asiento_auto('liquidacion_datafono', p_liq, p_motivo);
  update public.liquidaciones_datafono set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_liq;
end $$;
grant execute on function public.fn_anular_liquidacion_datafono(uuid, text) to authenticated;

alter table public.liquidaciones_datafono enable row level security;
create policy liq_datafono_sel on public.liquidaciones_datafono for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('tesoreria.conciliar'));
create policy liq_datafono_wr on public.liquidaciones_datafono for all to authenticated
  using (public.tengo_permiso('tesoreria.conciliar')) with check (public.tengo_permiso('tesoreria.conciliar'));

do $$ begin raise notice 'liquidacion_datafono lista.'; end $$;
