-- =============================================================================
-- Pagar una factura de proveedor SALDÁNDOLA completa cuando de la caja salió un
-- poco menos que el saldo (diferencia a favor = ingreso por descuento/redondeo).
-- Postea un asiento de 3 líneas y cierra la CxP:
--   Debe  cuenta por pagar   = saldo total de la factura
--   Haber caja               = lo que realmente salió de la caja
--   Haber cuenta diferencia  = la diferencia (ingreso), con su centro de costo
-- Reusa el modelo de pagos_proveedor (queda un pago que aplica la factura), pero
-- el asiento refleja la salida real de caja + el descuento.
-- =============================================================================

create or replace function public.fn_pagar_factura_caja_dif(
  p_retiro uuid, p_cxp uuid, p_cuenta_caja uuid, p_monto_caja numeric,
  p_cuenta_dif uuid, p_centro_dif uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric(18,2); v_prov uuid; v_cta_cxp uuid; v_fecha date; v_ref text; v_motivo text;
  v_caja numeric(18,2); v_dif numeric(18,2); v_pago uuid; v_asiento uuid; v_lineas jsonb;
begin
  if not public.tengo_permiso('compras.pagar') then raise exception 'No tenés permiso para pagar.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_caja and acepta_movimiento and estado='activo') then
    raise exception 'La cuenta de caja no es válida.'; end if;

  select saldo, proveedor_id into v_saldo, v_prov from public.cuentas_por_pagar where id = p_cxp;
  if v_saldo is null then raise exception 'Factura por pagar inexistente.'; end if;
  if v_saldo <= 0 then raise exception 'Esa factura no tiene saldo pendiente.'; end if;

  v_caja := round(coalesce(p_monto_caja,0), 2);
  if v_caja <= 0 then raise exception 'El monto de caja debe ser mayor a cero.'; end if;
  if v_caja > v_saldo + 0.005 then raise exception 'De la caja no puede salir más que el saldo de la factura (%).', v_saldo; end if;
  v_dif := round(v_saldo - v_caja, 2);           -- diferencia a favor (ingreso)
  if v_dif > 0 and p_cuenta_dif is null then raise exception 'Elegí la cuenta para la diferencia.'; end if;

  select fecha, control_caja, motivo into v_fecha, v_ref, v_motivo from public.retiro_caja where id = p_retiro;
  if v_fecha is null then raise exception 'Retiro inexistente.'; end if;

  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = v_prov;

  -- Pago que aplica la factura por su saldo completo (la deja pagada).
  insert into public.pagos_proveedor (proveedor_id, fecha, medio_pago, cuenta_pago_id, referencia, glosa, monto_total)
  values (v_prov, v_fecha, 'efectivo', p_cuenta_caja, nullif(btrim(coalesce(v_ref,'')),''),
          coalesce(v_motivo,'Pago de factura (retiro de caja)'), v_saldo)
  returning id into v_pago;
  insert into public.pagos_proveedor_lineas (pago_id, linea, cxp_id, monto) values (v_pago, 1, p_cxp, v_saldo);
  insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id, fecha)
  values (p_cxp, 'pago', v_saldo, 'pago_proveedor', v_pago, v_fecha);
  update public.cuentas_por_pagar
     set saldo = saldo - v_saldo,
         estado = case when round(saldo - v_saldo, 2) = 0 then 'pagada' else estado end
   where id = p_cxp;

  -- Asiento: Debe CxP (saldo) / Haber caja (lo que salió) / Haber diferencia (ingreso).
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp,     'debito',  v_saldo, 'detalle','Pago a proveedor'),
    jsonb_build_object('cuenta_id', p_cuenta_caja, 'credito', v_caja,  'detalle','Salida de caja'));
  if v_dif > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta_id', p_cuenta_dif, 'credito', v_dif,
                         'detalle','Diferencia/descuento en pago',
                         'centro_costo_id', p_centro_dif));
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Pago a proveedor', 'pago_proveedor', v_pago, v_lineas);
  update public.pagos_proveedor set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = v_pago;
  return v_pago;
end $$;
grant execute on function public.fn_pagar_factura_caja_dif(uuid, uuid, uuid, numeric, uuid, uuid) to authenticated;

do $$ begin raise notice 'pago de factura con diferencia listo.'; end $$;
