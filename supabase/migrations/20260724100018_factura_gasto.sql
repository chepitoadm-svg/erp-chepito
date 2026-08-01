-- =============================================================================
-- Compras: facturas de GASTO (no inventario), con centro de costo obligatorio.
--
-- No toda compra es mercadería. Servicios, limpieza, reparaciones, empaque que
-- se gasta de una, etc. son GASTO directo del negocio y DEBEN llevar centro de
-- costo (Chepito 1 / Chepito 2 / Taller). Una factura de gasto postea:
--   Debe cuenta de gasto (con centro) + Debe IVA crédito / Haber CxP.
-- No entra al inventario ni exige bodega.
-- =============================================================================

alter table public.facturas_compra
  add column if not exists tipo text not null default 'inventario'
    check (tipo in ('inventario','gasto')),
  add column if not exists cuenta_gasto_id uuid references public.cuentas(id),
  add column if not exists centro_costo_id uuid references public.centros_costo(id),
  add column if not exists glosa text;

-- === ALTA ATÓMICA DE FACTURA DE GASTO =======================================
create or replace function public.fn_crear_factura_gasto(
  p_proveedor    uuid,
  p_clave        text,
  p_fecha        date,
  p_condicion    text,
  p_plazo        int,
  p_cuenta_gasto uuid,
  p_centro       uuid,
  p_subtotal     numeric,
  p_iva_total    numeric,
  p_glosa        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_fecha date; v_venc date; v_sub numeric(18,2); v_iva numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  if p_cuenta_gasto is null then raise exception 'Elegí la cuenta de gasto.'; end if;
  if p_centro is null then raise exception 'El gasto exige un centro de costo.'; end if;
  if not exists (select 1 from public.cuentas
                  where id = p_cuenta_gasto and acepta_movimiento and estado='activo'
                    and tipo in ('gasto','ingreso')) then
    raise exception 'La cuenta de gasto no es válida (debe ser de resultado y aceptar movimiento).';
  end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Centro de costo inválido.'; end if;

  v_sub := round(coalesce(p_subtotal, 0), 2);
  v_iva := round(coalesce(p_iva_total, 0), 2);
  if v_sub <= 0 then raise exception 'El monto del gasto debe ser mayor que cero.'; end if;

  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);
  v_venc  := v_fecha + coalesce(p_plazo, 0);

  insert into public.facturas_compra
    (proveedor_id, bodega_id, recepcion_id, tipo, cuenta_gasto_id, centro_costo_id,
     clave, fecha_emision, condicion_venta, plazo_credito, fecha_vencimiento,
     subtotal, iva_total, total, glosa)
  values (p_proveedor, null, null, 'gasto', p_cuenta_gasto, p_centro,
          nullif(btrim(coalesce(p_clave,'')),''), v_fecha,
          nullif(btrim(coalesce(p_condicion,'')),''), p_plazo, v_venc,
          v_sub, v_iva, v_sub + v_iva, nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_factura_gasto(uuid, text, date, text, int, uuid, uuid, numeric, numeric, text) to authenticated;

-- === CONFIRMAR: se agrega la rama de GASTO ==================================
create or replace function public.fn_confirmar_factura(p_factura uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_recep uuid; v_bodega uuid; v_prov uuid;
  v_sub numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2); v_venc date;
  v_tipo text; v_cta_gasto uuid; v_centro uuid;
  v_cta_inv uuid; v_cta_iva uuid; v_cta_cxp uuid; v_cta_puente uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
  v_puente_val numeric(18,2); v_diff numeric(18,2); r record;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, fecha_emision, recepcion_id, bodega_id, proveedor_id, subtotal, iva_total, total,
         fecha_vencimiento, tipo, cuenta_gasto_id, centro_costo_id
    into v_estado, v_fecha, v_recep, v_bodega, v_prov, v_sub, v_iva, v_tot,
         v_venc, v_tipo, v_cta_gasto, v_centro
    from public.facturas_compra where id = p_factura;
  if v_estado is null then raise exception 'Factura inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La factura ya está %.', v_estado; end if;

  select id into v_cta_iva from public.cuentas where codigo='21-10-15-01-00';
  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = v_prov;

  if v_tipo = 'gasto' then
    -- GASTO: Debe cuenta de gasto (con centro) + Debe IVA / Haber CxP.
    if v_cta_gasto is null or v_centro is null then
      raise exception 'La factura de gasto necesita cuenta de gasto y centro de costo.';
    end if;
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_gasto, 'debito', v_sub, 'centro_costo_id', v_centro, 'detalle','Gasto'));
    if v_iva > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito');
    end if;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_cxp, 'credito', v_tot, 'detalle','Cuentas por pagar');
  else
    -- INVENTARIO: exige líneas.
    if not exists (select 1 from public.facturas_compra_lineas where factura_id = p_factura) then
      raise exception 'La factura no tiene líneas.'; end if;
    select id into v_cta_inv    from public.cuentas where codigo='11-60-01-00-00';
    select id into v_cta_puente from public.cuentas where codigo='21-10-25-00-00';

    if v_recep is null then
      -- CASO A: la factura trae la mercadería.
      if v_bodega is null then raise exception 'Factura sin recepción y sin bodega de ingreso.'; end if;
      for r in select * from public.facturas_compra_lineas where factura_id = p_factura order by linea loop
        insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, origen_tipo, origen_id, detalle)
        values (r.articulo_id, v_bodega, v_fecha, 'compra', r.cantidad, r.costo_unitario, 'factura_compra', p_factura, r.detalle);
      end loop;
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta_id', v_cta_inv, 'debito', v_sub, 'detalle','Compra (inventario)'),
        jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'),
        jsonb_build_object('cuenta_id', v_cta_cxp, 'credito', v_tot, 'detalle','Cuentas por pagar'));
    else
      -- CASO B: salda una recepción previa.
      select coalesce(sum(round(cantidad*costo_unitario,2)),0) into v_puente_val
        from public.recepciones_lineas where recepcion_id = v_recep;
      v_diff := v_sub - v_puente_val;
      if v_diff <> 0 then
        for r in
          select fl.articulo_id,
                 sum(fl.base_imponible) - coalesce((select sum(round(rl.cantidad*rl.costo_unitario,2))
                       from public.recepciones_lineas rl where rl.recepcion_id=v_recep and rl.articulo_id=fl.articulo_id),0) as d
            from public.facturas_compra_lineas fl where fl.factura_id=p_factura
           group by fl.articulo_id
          having sum(fl.base_imponible) - coalesce((select sum(round(rl.cantidad*rl.costo_unitario,2))
                       from public.recepciones_lineas rl where rl.recepcion_id=v_recep and rl.articulo_id=fl.articulo_id),0) <> 0
        loop
          insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, costo_total, origen_tipo, origen_id, detalle)
          select r.articulo_id, re.bodega_id, 'ajuste_valor', 0, r.d, 'factura_compra', p_factura, 'Diferencia de precio en factura'
            from public.recepciones re where re.id = v_recep;
        end loop;
      end if;
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta_id', v_cta_puente, 'debito', v_puente_val, 'detalle','Salda mercadería recibida por facturar'),
        jsonb_build_object('cuenta_id', v_cta_iva,    'debito', v_iva,        'detalle','IVA crédito'),
        jsonb_build_object('cuenta_id', v_cta_cxp,    'credito', v_tot,       'detalle','Cuentas por pagar'));
      if v_diff > 0 then
        v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_inv, 'debito', v_diff, 'detalle','Diferencia de precio');
      elsif v_diff < 0 then
        v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_inv, 'credito', -v_diff, 'detalle','Diferencia de precio');
      end if;
      update public.recepciones set facturada = true where id = v_recep;
    end if;
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Factura de compra', 'factura_compra', p_factura, v_lineas);

  insert into public.cuentas_por_pagar (proveedor_id, factura_id, fecha, fecha_vencimiento, monto_original, saldo)
  values (v_prov, p_factura, v_fecha, v_venc, v_tot, v_tot);

  update public.facturas_compra set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id = p_factura;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_factura(uuid) to authenticated;

do $$
begin
  raise notice 'Facturas de gasto listas (con centro de costo obligatorio).';
end $$;
