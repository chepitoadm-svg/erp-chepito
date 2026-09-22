-- =============================================================================
-- Reclasificar las compras que quedaron en INVENTARIO durante el perpetuo (jul-sep
-- 2026) a COSTO por centro, para que salgan en el Estado de Resultados por sucursal.
--
-- Cada factura de inventario de 1 paso (caso A, sin recepción) confirmada bajo el
-- perpetuo dejó su costo en 11-60-01 (activo, sin centro). Esta función postea un
-- asiento de reclasificación, a la MISMA fecha de la factura, que lo mueve a
-- Compras 51-10 (gravadas/exentas) con el centro de la factura y deja Inventario
-- en cero. No toca la CxP ni los pagos. Idempotente (origen 'reclasif_compra_inv'
-- + factura): correrla dos veces no duplica.
--
--   Debe 51-10-02 Compras gravadas (centro)
--   Debe 51-10-01 Compras exentas  (centro)
--   Haber 11-60-01 Inventario  (saca lo que había entrado)
-- =============================================================================

create or replace function public.fn_reclasificar_compra_inv(p_factura uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tipo text; v_recep uuid; v_centro uuid; v_fecha date; v_asiento uuid;
  v_inv numeric(18,2); v_grav numeric(18,2) := 0; v_exen numeric(18,2) := 0;
  v_c_grav uuid; v_c_exen uuid; v_c_inv uuid; v_lineas jsonb := '[]'::jsonb;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select tipo, recepcion_id, centro_costo_id, fecha_emision, asiento_id
    into v_tipo, v_recep, v_centro, v_fecha, v_asiento
    from public.facturas_compra where id = p_factura and estado = 'confirmada';
  if v_asiento is null then raise exception 'Factura inexistente o no confirmada.'; end if;
  if v_tipo <> 'inventario' then raise exception 'Solo aplica a facturas de inventario.'; end if;
  if v_recep is not null then raise exception 'La factura salda una recepción (caso B): revisar aparte.'; end if;
  if v_centro is null then raise exception 'La factura no tiene centro de costo.'; end if;

  select id into v_c_inv  from public.cuentas where codigo = '11-60-01-00-00';
  select id into v_c_grav from public.cuentas where codigo = '51-10-02-00-00';
  select id into v_c_exen from public.cuentas where codigo = '51-10-01-00-00';

  -- Lo que el asiento original dejó en Inventario (débito neto a 11-60-01).
  select round(coalesce(sum(l.debito - l.credito), 0), 2) into v_inv
    from public.asientos_lineas l
   where l.asiento_id = v_asiento and l.cuenta_id = v_c_inv;
  if coalesce(v_inv, 0) <= 0 then
    raise exception 'Esta factura no dejó saldo en Inventario (ya es periódica).';
  end if;

  -- Gravado / exento desde las líneas de la factura (iva_monto>0 = gravado).
  select coalesce(sum(case when iva_monto > 0 then base_imponible else 0 end), 0),
         coalesce(sum(case when iva_monto > 0 then 0 else base_imponible end), 0)
    into v_grav, v_exen
    from public.facturas_compra_lineas where factura_id = p_factura;
  -- El total gravado+exento debe calzar con lo que entró a inventario; si por
  -- redondeo difiere en céntimos, el exento absorbe el residuo.
  if round(v_grav + v_exen, 2) <> v_inv then
    v_exen := round(v_inv - v_grav, 2);
  end if;

  if v_grav > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_grav, 'debito', v_grav, 'centro_costo_id', v_centro, 'detalle', 'Reclasif. compra a costo (gravadas)'); end if;
  if v_exen > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_exen, 'debito', v_exen, 'centro_costo_id', v_centro, 'detalle', 'Reclasif. compra a costo (exentas)'); end if;
  v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_c_inv, 'credito', v_inv, 'detalle', 'Saca de inventario (periódico)');

  return public.fn_postear_asiento('diario', v_fecha, 'Reclasificación de compra a costo por centro', 'reclasif_compra_inv', p_factura, v_lineas);
end $$;
grant execute on function public.fn_reclasificar_compra_inv(uuid) to authenticated;

do $$ begin raise notice 'fn_reclasificar_compra_inv lista.'; end $$;
