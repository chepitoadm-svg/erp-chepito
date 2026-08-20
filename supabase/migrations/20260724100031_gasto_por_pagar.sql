-- =============================================================================
-- Gasto POR PAGAR: deuda rastreable. Un gasto que no se paga en el momento
-- (alquiler de julio que se paga en agosto, servicios, etc.) queda como
-- cuenta por pagar a un proveedor, y se salda después desde la pantalla de
-- Pagos (Compras), igual que las facturas de proveedor.
--   Confirmar (por pagar):  Debe cuenta de gasto (centro) [+ IVA]
--                           Haber 21-10-01 Cuentas por Pagar Comerciales
--   + crea cuentas_por_pagar (proveedor, vencimiento) pagable en el módulo de pagos.
-- El gasto "pagado" (caja/banco) sigue igual que antes.
-- =============================================================================

alter table public.gastos
  add column if not exists proveedor_id uuid references public.proveedores(id),
  add column if not exists fecha_vencimiento date;

alter table public.cuentas_por_pagar
  add column if not exists gasto_id uuid references public.gastos(id);

-- === ALTA (agrega proveedor + vencimiento para el modo "por pagar") =========
drop function if exists public.fn_crear_gasto(uuid, date, uuid, uuid, numeric, numeric, text);
create or replace function public.fn_crear_gasto(
  p_centro uuid, p_fecha date, p_cuenta_gasto uuid, p_cuenta_pago uuid,
  p_subtotal numeric, p_iva numeric, p_descripcion text,
  p_proveedor uuid default null, p_vencimiento date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sub numeric(18,2); v_iva numeric(18,2); v_cta_pago uuid; v_venc date; v_fecha date;
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Elegí un centro de costo válido.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_gasto and acepta_movimiento
                   and estado='activo' and tipo in ('gasto','ingreso')) then
    raise exception 'La cuenta de gasto no es válida (debe ser de resultado y aceptar movimiento).'; end if;

  v_sub := round(coalesce(p_subtotal,0),2);
  v_iva := round(coalesce(p_iva,0),2);
  if v_sub <= 0 then raise exception 'El monto del gasto debe ser mayor que cero.'; end if;
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);

  if p_proveedor is not null then
    -- POR PAGAR: contra Cuentas por Pagar Comerciales, con proveedor + vencimiento.
    if not exists (select 1 from public.proveedores where id = p_proveedor and estado='activo') then
      raise exception 'Elegí un proveedor válido para el gasto por pagar.'; end if;
    select id into v_cta_pago from public.cuentas where codigo = '21-10-01-00-00';
    v_venc := coalesce(p_vencimiento, v_fecha);
  else
    -- PAGADO: caja/banco (o cuenta por pagar suelta sin proveedor).
    if not exists (select 1 from public.cuentas where id = p_cuenta_pago and acepta_movimiento
                     and estado='activo' and tipo in ('activo','pasivo')) then
      raise exception 'La cuenta de pago no es válida (caja/banco o cuenta por pagar).'; end if;
    v_cta_pago := p_cuenta_pago;
    v_venc := null;
  end if;

  insert into public.gastos (fecha, centro_costo_id, cuenta_gasto_id, cuenta_pago_id,
                             descripcion, subtotal, iva, total, proveedor_id, fecha_vencimiento)
  values (v_fecha, p_centro, p_cuenta_gasto, v_cta_pago,
          nullif(btrim(coalesce(p_descripcion,'')),''), v_sub, v_iva, v_sub + v_iva,
          p_proveedor, v_venc)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_gasto(uuid, date, uuid, uuid, numeric, numeric, text, uuid, date) to authenticated;

-- === CONFIRMAR: crea la CxP si es "por pagar" ===============================
create or replace function public.fn_confirmar_gasto(p_gasto uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_centro uuid; v_cta_gasto uuid; v_cta_pago uuid;
  v_sub numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2);
  v_prov uuid; v_venc date; v_cta_iva uuid; v_lineas jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  select estado, fecha, centro_costo_id, cuenta_gasto_id, cuenta_pago_id, subtotal, iva, total,
         proveedor_id, fecha_vencimiento
    into v_estado, v_fecha, v_centro, v_cta_gasto, v_cta_pago, v_sub, v_iva, v_tot, v_prov, v_venc
    from public.gastos where id = p_gasto;
  if v_estado is null then raise exception 'Gasto inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El gasto ya está %.', v_estado; end if;

  select id into v_cta_iva from public.cuentas where codigo = '21-10-15-01-00';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_gasto, 'debito', v_sub, 'centro_costo_id', v_centro, 'detalle','Gasto'));
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'); end if;
  v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_pago, 'credito', v_tot, 'detalle','Pago del gasto');

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Gasto', 'gasto', p_gasto, v_lineas);

  -- Deuda rastreable si es por pagar a un proveedor.
  if v_prov is not null then
    insert into public.cuentas_por_pagar
      (proveedor_id, factura_id, gasto_id, fecha, fecha_vencimiento, monto_original, saldo, estado)
    values (v_prov, null, p_gasto, v_fecha, v_venc, v_tot, v_tot, 'pendiente');
  end if;

  update public.gastos set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_gasto;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_gasto(uuid) to authenticated;

-- === ANULAR: bloquea si la CxP ya tiene pagos; si no, la anula ==============
create or replace function public.fn_anular_gasto(p_gasto uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_saldo numeric(18,2); v_orig numeric(18,2);
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  select estado into v_estado from public.gastos where id = p_gasto;
  if v_estado is null then raise exception 'Gasto inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un gasto confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Si el gasto dejó una CxP y ya tiene pagos aplicados, no se puede anular.
  select saldo, monto_original into v_saldo, v_orig
    from public.cuentas_por_pagar where gasto_id = p_gasto and estado <> 'anulada';
  if found and v_saldo < v_orig then
    raise exception 'El gasto tiene pagos aplicados; anulá los pagos antes de anular el gasto.'; end if;

  perform public.fn_anular_asiento_auto('gasto', p_gasto, p_motivo);
  update public.cuentas_por_pagar set estado='anulada', saldo=0 where gasto_id = p_gasto and estado='pendiente';
  update public.gastos set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_gasto;
end $$;
grant execute on function public.fn_anular_gasto(uuid, text) to authenticated;

do $$ begin raise notice 'gasto por pagar (deuda rastreable) listo.'; end $$;
