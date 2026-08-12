-- =============================================================================
-- VUELTA AL INVENTARIO PERMANENTE (perpetuo) — Fase A: la compra entra a Inventario.
--
-- Decisión del usuario (2026-08): el inventario se necesita PERMANENTE (perpetuo),
-- no periódico. La compra deja de ir a Compras (gasto) y vuelve a entrar como
-- ACTIVO en Inventario (11-60-01), siempre visible. El costo saldrá luego con las
-- salidas reales (materia prima desde la app de producción; producto terminado
-- desde QuPOS) — eso son las Fases B y C. El cierre mensual por toma física queda
-- como AJUSTE. Esta migración solo cambia el posteo del CASO A (factura de 1 paso);
-- el gasto y la recepción (caso B) quedan igual.
--
-- Caso A ahora:  Debe 11-60-01 Inventario (subtotal) + Debe IVA / Haber CxP.
--               Ya NO exige centro (Inventario es cuenta de balance, sin centro).
--               El kardex de entrada se mantiene para los artículos inventariables.
-- =============================================================================

create or replace function public.fn_confirmar_factura(p_factura uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_recep uuid; v_bodega uuid; v_prov uuid;
  v_sub numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2); v_venc date;
  v_tipo text; v_cta_gasto uuid; v_centro uuid;
  v_cta_grav uuid; v_cta_exen uuid; v_cta_iva uuid; v_cta_cxp uuid; v_cta_puente uuid;
  v_grav numeric(18,2) := 0; v_exen numeric(18,2) := 0;
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
    if v_cta_gasto is null or v_centro is null then
      raise exception 'La factura de gasto necesita cuenta de gasto y centro de costo.'; end if;
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_gasto, 'debito', v_sub, 'centro_costo_id', v_centro, 'detalle','Gasto'));
    if v_iva > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'); end if;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_cxp, 'credito', v_tot, 'detalle','Cuentas por pagar');

  elsif v_recep is not null then
    -- CASO B (salda recepción) — se mantiene el esquema de puente.
    if not exists (select 1 from public.facturas_compra_lineas where factura_id = p_factura) then
      raise exception 'La factura no tiene líneas.'; end if;
    select id into v_cta_grav from public.cuentas where codigo='11-60-01-00-00';  -- inventario (recepción)
    select id into v_cta_puente from public.cuentas where codigo='21-10-25-00-00';
    select coalesce(sum(round(cantidad*costo_unitario,2)),0) into v_puente_val
      from public.recepciones_lineas where recepcion_id = v_recep;
    v_diff := v_sub - v_puente_val;
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_puente, 'debito', v_puente_val, 'detalle','Salda mercadería recibida'),
      jsonb_build_object('cuenta_id', v_cta_iva,    'debito', v_iva,        'detalle','IVA crédito'),
      jsonb_build_object('cuenta_id', v_cta_cxp,    'credito', v_tot,       'detalle','Cuentas por pagar'));
    if v_diff > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_grav, 'debito', v_diff, 'detalle','Diferencia de precio');
    elsif v_diff < 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_grav, 'credito', -v_diff, 'detalle','Diferencia de precio');
    end if;
    update public.recepciones set facturada = true where id = v_recep;

  else
    -- CASO A (1 paso) — PERPETUO: la compra entra a Inventario (activo), SIN centro.
    if not exists (select 1 from public.facturas_compra_lineas where factura_id = p_factura) then
      raise exception 'La factura no tiene líneas.'; end if;
    if v_bodega is null then raise exception 'La compra exige bodega de ingreso.'; end if;
    select id into v_cta_grav from public.cuentas where codigo='11-60-01-00-00';  -- Inventario

    for r in select fl.*, a.inventariable
               from public.facturas_compra_lineas fl
               join public.articulos a on a.id = fl.articulo_id
              where fl.factura_id = p_factura order by fl.linea loop
      -- Kardex de entrada para los artículos inventariables.
      if r.inventariable then
        insert into public.movimientos_inventario
          (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, origen_tipo, origen_id, detalle)
        values (r.articulo_id, v_bodega, v_fecha, 'compra', r.cantidad, r.costo_unitario, 'factura_compra', p_factura, r.detalle);
      end if;
    end loop;

    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_grav, 'debito', v_sub, 'detalle','Inventario de mercadería');
    if v_iva > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'); end if;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_cxp, 'credito', v_tot, 'detalle','Cuentas por pagar');
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Factura de compra', 'factura_compra', p_factura, v_lineas);

  insert into public.cuentas_por_pagar (proveedor_id, factura_id, fecha, fecha_vencimiento, monto_original, saldo)
  values (v_prov, p_factura, v_fecha, v_venc, v_tot, v_tot);

  update public.facturas_compra set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id = p_factura;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_factura(uuid) to authenticated;

do $$ begin raise notice 'Perpetuo Fase A: la compra (caso A) entra a Inventario 11-60-01.'; end $$;
