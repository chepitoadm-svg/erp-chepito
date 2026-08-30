-- =============================================================================
-- Ventas del día: DESGLOSE POR MEDIO DE PAGO. Antes todo entraba a "Caja general";
-- ahora se separa efectivo / tarjeta / sinpe, y las tarjetas van a la cuenta por
-- cobrar del DATAFONO (no a caja), para poder conciliarlas contra el depósito del
-- banco. El asiento pasa a:
--   Debe 11-10-10-01 Caja general     (efectivo)
--   Debe 11-30-02-01 Datafono         (tarjeta)   ← la plata aún no está en caja
--   Debe 11-10-10-05 Sinpes           (sinpe)
--   Haber 41-10-02 / 41-10-01 / 21-10-15-04  (gravado / exento / IVA)
-- =============================================================================

alter table public.ventas_dia
  add column if not exists efectivo numeric(18,2) not null default 0,
  add column if not exists tarjeta  numeric(18,2) not null default 0,
  add column if not exists sinpe    numeric(18,2) not null default 0;

-- Lo ya registrado se posteó todo a caja: se refleja en efectivo para que cuadre.
update public.ventas_dia
   set efectivo = total
 where efectivo = 0 and tarjeta = 0 and sinpe = 0 and total > 0;

-- === ALTA (con split) =======================================================
-- Params nuevos con default 0 (compatibles con llamadas viejas de 6 args). Si no
-- se pasa split (los 3 en 0), se asume TODO efectivo (comportamiento anterior).
drop function if exists public.fn_crear_venta_dia(uuid, date, numeric, numeric, numeric, text);
create or replace function public.fn_crear_venta_dia(
  p_centro uuid, p_fecha date, p_gravado numeric, p_exento numeric, p_iva numeric, p_glosa text,
  p_efectivo numeric default 0, p_tarjeta numeric default 0, p_sinpe numeric default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric(18,2); v_ef numeric(18,2); v_ta numeric(18,2); v_si numeric(18,2);
begin
  perform public.fn_exigir_permiso('ventas.registrar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'La venta exige un negocio (Chepito 1 o 2).'; end if;
  v_total := round(coalesce(p_gravado,0),2) + round(coalesce(p_exento,0),2) + round(coalesce(p_iva,0),2);
  if v_total <= 0 then raise exception 'La venta no tiene monto.'; end if;

  v_ef := round(coalesce(p_efectivo,0),2);
  v_ta := round(coalesce(p_tarjeta,0),2);
  v_si := round(coalesce(p_sinpe,0),2);
  if v_ef = 0 and v_ta = 0 and v_si = 0 then
    v_ef := v_total;  -- sin desglose: todo a caja
  elsif round(v_ef + v_ta + v_si, 2) <> v_total then
    raise exception 'El desglose de cobro (%) no cuadra con la venta (%).', round(v_ef + v_ta + v_si, 2), v_total;
  end if;

  insert into public.ventas_dia (fecha, centro_costo_id, gravado, exento, iva, total, efectivo, tarjeta, sinpe, glosa)
  values (coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date), p_centro,
          round(coalesce(p_gravado,0),2), round(coalesce(p_exento,0),2), round(coalesce(p_iva,0),2),
          v_total, v_ef, v_ta, v_si, nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_venta_dia(uuid, date, numeric, numeric, numeric, text, numeric, numeric, numeric) to authenticated;

-- === CONFIRMAR (postea el split) ============================================
create or replace function public.fn_confirmar_venta_dia(p_venta uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_centro uuid;
  v_grav numeric(18,2); v_exen numeric(18,2); v_iva numeric(18,2); v_total numeric(18,2);
  v_ef numeric(18,2); v_ta numeric(18,2); v_si numeric(18,2);
  v_cta_caja uuid; v_cta_dat uuid; v_cta_sin uuid; v_cta_vg uuid; v_cta_ve uuid; v_cta_iva uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('ventas.registrar');
  select estado, fecha, centro_costo_id, gravado, exento, iva, total, efectivo, tarjeta, sinpe
    into v_estado, v_fecha, v_centro, v_grav, v_exen, v_iva, v_total, v_ef, v_ta, v_si
    from public.ventas_dia where id = p_venta;
  if v_estado is null then raise exception 'Venta inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La venta ya está %.', v_estado; end if;

  -- Compatibilidad: si no hay split, todo a efectivo.
  if v_ef = 0 and v_ta = 0 and v_si = 0 then v_ef := v_total; end if;

  select id into v_cta_caja from public.cuentas where codigo = '11-10-10-01-00';
  select id into v_cta_dat  from public.cuentas where codigo = '11-30-02-01-00';
  select id into v_cta_sin  from public.cuentas where codigo = '11-10-10-05-00';
  select id into v_cta_vg   from public.cuentas where codigo = '41-10-02-00-00';
  select id into v_cta_ve   from public.cuentas where codigo = '41-10-01-00-00';
  select id into v_cta_iva  from public.cuentas where codigo = '21-10-15-04-00';

  -- Débitos: cómo entró la plata.
  if v_ef > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_caja, 'debito', v_ef, 'detalle','Efectivo'); end if;
  if v_ta > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dat,  'debito', v_ta, 'detalle','Tarjeta (datafono)'); end if;
  if v_si > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_sin,  'debito', v_si, 'detalle','Sinpe'); end if;
  -- Créditos: la venta.
  if v_grav > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_vg, 'credito', v_grav, 'centro_costo_id', v_centro, 'detalle','Ventas gravadas'); end if;
  if v_exen > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_ve, 'credito', v_exen, 'centro_costo_id', v_centro, 'detalle','Ventas exentas'); end if;
  if v_iva  > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'credito', v_iva, 'detalle','IVA cobrado'); end if;

  v_asiento := public.fn_postear_asiento('ingreso', v_fecha, 'Ventas del día', 'venta_dia', p_venta, v_lineas);

  update public.ventas_dia set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_venta;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_venta_dia(uuid) to authenticated;

do $$ begin raise notice 'ventas_dia con medios de pago listo.'; end $$;
