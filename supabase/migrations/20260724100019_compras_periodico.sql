-- =============================================================================
-- Compras: método PERIÓDICO por centro de costo.
--
-- Decisión del negocio: la compra de mercadería/materia prima se reconoce como
-- COSTO de una vez, cargado al centro del negocio (Chepito 1 / 2 / Taller). Ya
-- no entra a Inventario (activo). El Estado de Resultados por centro se arma con
-- esto; el Taller (intermedio) acumula y se prorratea a fin de mes; y el cierre
-- mensual (conteo físico) devuelve a Inventario lo no consumido.
--
--   Debe 51-10-02 Compras gravadas (centro)   ← líneas con IVA
--   Debe 51-10-01 Compras exentas  (centro)   ← líneas sin IVA
--   Debe 21-10-15-01 IVA crédito
--   Haber CxP
--
-- Se mantiene el KARDEX de control (cantidades) SOLO para artículos
-- inventariables (materia prima/insumos); el producto terminado no lleva kardex.
-- El centro es OBLIGATORIO en toda factura de compra.
-- =============================================================================

-- fn_crear_factura y fn_crear_factura_xml pasan a exigir p_centro. Se recrean
-- con la firma nueva (cambia la aridad).
drop function if exists public.fn_crear_factura(uuid, uuid, text, date, text, int, jsonb);
drop function if exists public.fn_crear_factura_xml(uuid, uuid, text, date, text, int, jsonb);

create or replace function public.fn_crear_factura(
  p_proveedor     uuid,
  p_bodega        uuid,
  p_centro        uuid,
  p_clave         text,
  p_fecha_emision date,
  p_condicion     text,
  p_plazo         int,
  p_lineas        jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_fecha date; v_venc date;
  v_sub numeric(18,2) := 0; v_iva numeric(18,2) := 0;
  r jsonb; i int := 0; v_base numeric(18,2); v_pct numeric(5,2); v_ivam numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  if p_bodega is null then raise exception 'La factura exige la bodega de ingreso.'; end if;
  if p_centro is null then raise exception 'La compra exige un centro de costo (negocio).'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Centro de costo inválido.'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura no tiene líneas.'; end if;

  v_fecha := coalesce(p_fecha_emision, (now() at time zone 'America/Costa_Rica')::date);
  v_venc  := v_fecha + coalesce(p_plazo, 0);

  insert into public.facturas_compra
    (proveedor_id, bodega_id, centro_costo_id, recepcion_id, tipo, clave, fecha_emision,
     condicion_venta, plazo_credito, fecha_vencimiento, subtotal, iva_total, total)
  values (p_proveedor, p_bodega, p_centro, null, 'inventario',
          nullif(btrim(coalesce(p_clave,'')),''), v_fecha,
          nullif(btrim(coalesce(p_condicion,'')),''), p_plazo, v_venc, 0, 0, 0)
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_base := round((r->>'cantidad')::numeric * (r->>'costo_unitario')::numeric, 2);
    select porcentaje into v_pct from public.iva_tarifas where id = (r->>'iva_tarifa_id')::uuid;
    if v_pct is null then raise exception 'Tarifa de IVA inválida en la línea %.', i; end if;
    v_ivam := round(v_base * v_pct / 100.0, 2);
    insert into public.facturas_compra_lineas
      (factura_id, linea, codigo_comercial, articulo_id, cantidad, costo_unitario,
       base_imponible, iva_tarifa_id, iva_monto, detalle)
    values (v_id, i, nullif(btrim(coalesce(r->>'codigo_comercial','')),''),
            (r->>'articulo_id')::uuid, (r->>'cantidad')::numeric, (r->>'costo_unitario')::numeric,
            v_base, (r->>'iva_tarifa_id')::uuid, v_ivam,
            nullif(btrim(coalesce(r->>'detalle','')),''));
    v_sub := v_sub + v_base; v_iva := v_iva + v_ivam;
  end loop;

  update public.facturas_compra set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_factura(uuid, uuid, uuid, text, date, text, int, jsonb) to authenticated;

create or replace function public.fn_crear_factura_xml(
  p_proveedor     uuid,
  p_bodega        uuid,
  p_centro        uuid,
  p_clave         text,
  p_fecha_emision date,
  p_condicion     text,
  p_plazo         int,
  p_lineas        jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_fecha date; v_venc date;
  v_sub numeric(18,2) := 0; v_iva numeric(18,2) := 0;
  r jsonb; i int := 0; v_base numeric(18,2); v_ivam numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  if p_bodega is null then raise exception 'La factura exige la bodega de ingreso.'; end if;
  if p_centro is null then raise exception 'La compra exige un centro de costo (negocio).'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Centro de costo inválido.'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura no tiene líneas.'; end if;

  v_fecha := coalesce(p_fecha_emision, (now() at time zone 'America/Costa_Rica')::date);
  v_venc  := v_fecha + coalesce(p_plazo, 0);

  insert into public.facturas_compra
    (proveedor_id, bodega_id, centro_costo_id, recepcion_id, tipo, clave, fecha_emision,
     condicion_venta, plazo_credito, fecha_vencimiento, subtotal, iva_total, total)
  values (p_proveedor, p_bodega, p_centro, null, 'inventario',
          nullif(btrim(coalesce(p_clave,'')),''), v_fecha,
          nullif(btrim(coalesce(p_condicion,'')),''), p_plazo, v_venc, 0, 0, 0)
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_base := round((r->>'base_imponible')::numeric, 2);
    v_ivam := round((r->>'iva_monto')::numeric, 2);
    insert into public.facturas_compra_lineas
      (factura_id, linea, codigo_comercial, articulo_id, cantidad, costo_unitario,
       base_imponible, iva_tarifa_id, iva_monto, detalle)
    values (v_id, i, nullif(btrim(coalesce(r->>'codigo_comercial','')),''),
            (r->>'articulo_id')::uuid, (r->>'cantidad')::numeric, (r->>'costo_unitario')::numeric,
            v_base, nullif(btrim(coalesce(r->>'iva_tarifa_id','')),'')::uuid, v_ivam,
            nullif(btrim(coalesce(r->>'detalle','')),''));
    v_sub := v_sub + v_base; v_iva := v_iva + v_ivam;
  end loop;

  update public.facturas_compra set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_factura_xml(uuid, uuid, uuid, text, date, text, int, jsonb) to authenticated;

-- === CONFIRMAR: caso A (inventario) ahora es PERIÓDICO (Compras + centro) =====
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
    -- CASO B (salda recepción) — se mantiene el esquema anterior (puente).
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
    -- CASO A (1 paso) — PERIÓDICO: costo a Compras (gravado/exento) con centro.
    if not exists (select 1 from public.facturas_compra_lineas where factura_id = p_factura) then
      raise exception 'La factura no tiene líneas.'; end if;
    if v_centro is null then raise exception 'La compra exige un centro de costo.'; end if;
    if v_bodega is null then raise exception 'La compra exige bodega de ingreso.'; end if;
    select id into v_cta_grav from public.cuentas where codigo='51-10-02-00-00';
    select id into v_cta_exen from public.cuentas where codigo='51-10-01-00-00';

    for r in select fl.*, a.inventariable
               from public.facturas_compra_lineas fl
               join public.articulos a on a.id = fl.articulo_id
              where fl.factura_id = p_factura order by fl.linea loop
      -- Kardex de control SOLO para inventariables (materia prima/insumos).
      if r.inventariable then
        insert into public.movimientos_inventario
          (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, origen_tipo, origen_id, detalle)
        values (r.articulo_id, v_bodega, v_fecha, 'compra', r.cantidad, r.costo_unitario, 'factura_compra', p_factura, r.detalle);
      end if;
      if r.iva_monto > 0 then v_grav := v_grav + r.base_imponible;
      else v_exen := v_exen + r.base_imponible; end if;
    end loop;

    if v_grav > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_grav, 'debito', v_grav, 'centro_costo_id', v_centro, 'detalle','Compras gravadas'); end if;
    if v_exen > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_exen, 'debito', v_exen, 'centro_costo_id', v_centro, 'detalle','Compras exentas'); end if;
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

do $$
begin
  raise notice 'Compras periódicas listas: costo a Compras (gravado/exento) por centro.';
end $$;
