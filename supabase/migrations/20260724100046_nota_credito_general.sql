-- =============================================================================
-- Nota de crédito de compra como CRÉDITO GENERAL del proveedor.
--
-- Al confirmar una devolución de mercadería, en vez de bajar la CxP de una
-- factura puntual, se crea una LÍNEA DE CRÉDITO en cuentas_por_pagar (saldo
-- NEGATIVO, sin factura). El asiento contable no cambia (Debe CxP / Haber
-- Inventario + IVA), así que el mayor de CxP ya refleja el crédito.
--
-- En el pago se pueden seleccionar facturas (saldo +) y créditos (saldo −); el
-- efectivo a pagar = suma (neto). El asiento del pago sigue siendo Debe CxP neto
-- / Haber banco neto, porque el crédito ya estaba posteado.
-- =============================================================================

alter table public.cuentas_por_pagar
  add column if not exists tipo text not null default 'factura' check (tipo in ('factura', 'credito')),
  add column if not exists devolucion_id uuid references public.devoluciones_compra(id);

-- Las líneas del pago y las aplicaciones pueden ser negativas (nota de crédito).
alter table public.pagos_proveedor_lineas drop constraint if exists pagos_proveedor_lineas_monto_check;
alter table public.pagos_proveedor_lineas add constraint pagos_proveedor_lineas_monto_check check (monto <> 0);
alter table public.cxp_aplicaciones drop constraint if exists cxp_aplicaciones_monto_check;
alter table public.cxp_aplicaciones add constraint cxp_aplicaciones_monto_check check (monto <> 0);

-- === Devolución: genera un crédito general (saldo negativo) ==================
create or replace function public.fn_confirmar_devolucion(p_dev uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; v_prov uuid; v_fact uuid;
  v_base numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2);
  v_inv_val numeric(18,2) := 0; v_diff numeric(18,2); r record;
  v_cta_inv uuid; v_cta_iva uuid; v_cta_cxp uuid; v_cta_dev uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, fecha, bodega_id, proveedor_id, factura_id, subtotal, iva_total, total
    into v_estado, v_fecha, v_bodega, v_prov, v_fact, v_base, v_iva, v_tot
    from public.devoluciones_compra where id = p_dev;
  if v_estado is null then raise exception 'Devolución inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La devolución ya está %.', v_estado; end if;
  if not exists (select 1 from public.devoluciones_compra_lineas where devolucion_id=p_dev) then
    raise exception 'La devolución no tiene líneas.'; end if;

  select id into v_cta_inv from public.cuentas where codigo='11-60-01-00-00';
  select id into v_cta_iva from public.cuentas where codigo='21-10-15-01-00';
  select id into v_cta_dev from public.cuentas where codigo = case when v_iva > 0 then '51-20-02-02-00' else '51-20-02-01-00' end;
  select coalesce(cuenta_cxp_id,(select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id=v_prov;

  for r in select * from public.devoluciones_compra_lineas where devolucion_id=p_dev order by linea loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, v_fecha, 'devolucion_compra', -r.cantidad, 'devolucion_compra', p_dev, r.detalle);
    v_inv_val := v_inv_val + abs((select costo_total from public.movimientos_inventario
      where origen_tipo='devolucion_compra' and origen_id=p_dev and articulo_id=r.articulo_id and tipo='devolucion_compra'
      order by creado_en desc limit 1));
  end loop;

  v_diff := v_base - v_inv_val;
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp, 'debito',  v_tot,     'detalle','Nota de crédito (devolución)'),
    jsonb_build_object('cuenta_id', v_cta_inv, 'credito', v_inv_val, 'detalle','Salida de inventario'));
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'credito', v_iva, 'detalle','Reversa de IVA crédito');
  end if;
  if v_diff > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dev, 'credito', v_diff, 'detalle','Devolución sobre compras');
  elsif v_diff < 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dev, 'debito', -v_diff, 'detalle','Devolución sobre compras');
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Nota de crédito (devolución)', 'devolucion_compra', p_dev, v_lineas);

  -- Crédito general del proveedor (saldo negativo, sin factura).
  insert into public.cuentas_por_pagar
    (proveedor_id, factura_id, tipo, devolucion_id, fecha, fecha_vencimiento, monto_original, saldo, estado)
  values (v_prov, null, 'credito', p_dev, v_fecha, null, -v_tot, -v_tot, 'pendiente');

  update public.devoluciones_compra set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id=p_dev;
  return v_asiento;
end $$;

-- === Anular devolución: quita el crédito si aún no se aplicó ================
create or replace function public.fn_anular_devolucion(p_dev uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_bodega uuid; r record; v_cxp uuid; v_saldo numeric(18,2); v_mo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, bodega_id into v_estado, v_bodega from public.devoluciones_compra where id=p_dev;
  if v_estado is null then raise exception 'Devolución inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una devolución confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  select id, saldo, monto_original into v_cxp, v_saldo, v_mo
    from public.cuentas_por_pagar where devolucion_id = p_dev and tipo='credito';
  if v_cxp is not null and round(v_saldo,2) <> round(v_mo,2) then
    raise exception 'El crédito de esta devolución ya se aplicó a un pago. Anulá el pago primero.';
  end if;

  for r in select articulo_id, cantidad from public.movimientos_inventario
            where origen_tipo='devolucion_compra' and origen_id=p_dev and tipo='devolucion_compra' order by creado_en loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, 'ajuste_pos', -r.cantidad, 'devolucion_anulacion', p_dev, 'Reingreso por devolución anulada');
  end loop;

  perform public.fn_anular_asiento_auto('devolucion_compra', p_dev, p_motivo);

  if v_cxp is not null then
    update public.cuentas_por_pagar set estado='anulada', saldo=0 where id = v_cxp;
  end if;

  update public.devoluciones_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id=p_dev;
end $$;

-- === Pago: aceptar líneas de crédito (saldo negativo) =======================
create or replace function public.fn_crear_pago(
  p_proveedor uuid, p_fecha date, p_medio text, p_cuenta_pago uuid,
  p_referencia text, p_glosa text, p_lineas jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; r jsonb; i int := 0; v_total numeric(18,2) := 0;
  v_saldo numeric(18,2); v_prov uuid; v_monto numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.pagar');
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'El pago no tiene facturas.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_pago and acepta_movimiento and estado='activo') then
    raise exception 'La cuenta de pago no es válida.'; end if;

  insert into public.pagos_proveedor (proveedor_id, fecha, medio_pago, cuenta_pago_id, referencia, glosa)
  values (p_proveedor, coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date),
          p_medio, p_cuenta_pago, nullif(btrim(coalesce(p_referencia,'')),''), nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_monto := round((r->>'monto')::numeric, 2);
    select saldo, proveedor_id into v_saldo, v_prov from public.cuentas_por_pagar where id = (r->>'cxp_id')::uuid;
    if v_saldo is null then raise exception 'Cuenta por pagar inexistente en la línea %.', i; end if;
    if v_prov <> p_proveedor then raise exception 'La línea % no es de ese proveedor.', i; end if;
    if v_monto = 0 then raise exception 'El monto de la línea % no puede ser cero.', i; end if;
    -- Factura: monto y saldo positivos. Crédito: ambos negativos.
    if sign(v_monto) <> sign(v_saldo) then raise exception 'El monto de la línea % no coincide con el signo del saldo.', i; end if;
    if abs(v_monto) > abs(v_saldo) then raise exception 'El monto de la línea % (%) supera el saldo (%).', i, v_monto, v_saldo; end if;

    insert into public.pagos_proveedor_lineas (pago_id, linea, cxp_id, monto) values (v_id, i, (r->>'cxp_id')::uuid, v_monto);
    v_total := v_total + v_monto;
  end loop;

  if v_total <= 0 then raise exception 'El pago neto debe ser mayor que cero (el crédito no puede superar las facturas).'; end if;
  update public.pagos_proveedor set monto_total = v_total where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_pago(uuid, date, text, uuid, text, text, jsonb) to authenticated;

create or replace function public.fn_confirmar_pago(p_pago uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_prov uuid; v_cuenta uuid; v_total numeric(18,2);
  v_cta_cxp uuid; v_lineas jsonb; v_asiento uuid; r record; v_saldo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.pagar');
  select estado, fecha, proveedor_id, cuenta_pago_id, monto_total
    into v_estado, v_fecha, v_prov, v_cuenta, v_total from public.pagos_proveedor where id = p_pago;
  if v_estado is null then raise exception 'Pago inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El pago ya está %.', v_estado; end if;
  if not exists (select 1 from public.pagos_proveedor_lineas where pago_id = p_pago) then
    raise exception 'El pago no tiene líneas.'; end if;

  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = v_prov;

  for r in select * from public.pagos_proveedor_lineas where pago_id = p_pago order by linea loop
    select saldo into v_saldo from public.cuentas_por_pagar where id = r.cxp_id;
    if sign(r.monto) <> sign(v_saldo) or abs(r.monto) > abs(v_saldo) + 0.005 then
      raise exception 'El abono supera el saldo actual de una factura/crédito.'; end if;
    insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id, fecha)
    values (r.cxp_id, 'pago', r.monto, 'pago_proveedor', p_pago, v_fecha);
    update public.cuentas_por_pagar
       set saldo = saldo - r.monto,
           estado = case when round(saldo - r.monto, 2) = 0 then 'pagada' else estado end
     where id = r.cxp_id;
  end loop;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp,  'debito',  v_total, 'detalle','Pago a proveedor'),
    jsonb_build_object('cuenta_id', v_cuenta,   'credito', v_total, 'detalle','Salida de caja/banco'));
  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Pago a proveedor', 'pago_proveedor', p_pago, v_lineas);

  update public.pagos_proveedor set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_pago;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_pago(uuid) to authenticated;

do $$ begin raise notice 'Notas de crédito generales listas.'; end $$;
