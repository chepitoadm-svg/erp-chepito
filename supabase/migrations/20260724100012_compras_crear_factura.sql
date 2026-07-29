-- =============================================================================
-- Fase 3 — Migración 11 (D1): alta atómica de la factura de compra.
--
-- fn_crear_factura: crea la factura (cabecera borrador + líneas) en UNA
-- transacción, calculando base imponible e IVA por línea desde la tarifa del
-- catálogo, y los totales. Igual que ajustes/transferencias, evita borradores
-- huérfanos (facturas_compra tiene trg_fact_no_delete).
--
-- Este es el caso normal de 1 paso: la factura TRAE la mercadería
-- (recepcion_id = null), así que exige bodega de ingreso. El confirmar
-- (fn_confirmar_factura, ya existente) ingresa el inventario, postea
-- Debe Inventario + Debe IVA / Haber CxP y crea la cuenta por pagar.
-- =============================================================================

create or replace function public.fn_crear_factura(
  p_proveedor     uuid,
  p_bodega        uuid,
  p_clave         text,
  p_fecha_emision date,
  p_condicion     text,
  p_plazo         int,
  p_lineas        jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_fecha date;
  v_venc date;
  v_sub numeric(18,2) := 0;
  v_iva numeric(18,2) := 0;
  r jsonb;
  i int := 0;
  v_base numeric(18,2);
  v_pct numeric(5,2);
  v_ivam numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');

  if p_bodega is null then
    raise exception 'La factura (1 paso) exige la bodega de ingreso.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura no tiene líneas.';
  end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor and estado = 'activo') then
    raise exception 'El proveedor no existe o está inactivo.';
  end if;
  if auth.uid() is not null and not public.soy_administrador()
     and p_bodega not in (select b from public.fn_bodegas_visibles() b) then
    raise exception 'No podés ingresar mercadería en esa bodega.';
  end if;

  v_fecha := coalesce(p_fecha_emision, (now() at time zone 'America/Costa_Rica')::date);
  v_venc  := v_fecha + coalesce(p_plazo, 0);

  insert into public.facturas_compra
    (proveedor_id, bodega_id, recepcion_id, clave, fecha_emision,
     condicion_venta, plazo_credito, fecha_vencimiento, subtotal, iva_total, total)
  values (p_proveedor, p_bodega, null, nullif(btrim(coalesce(p_clave,'')),''), v_fecha,
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

    v_sub := v_sub + v_base;
    v_iva := v_iva + v_ivam;
  end loop;

  update public.facturas_compra
     set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva
   where id = v_id;

  return v_id;
end $$;

grant execute on function public.fn_crear_factura(uuid, uuid, text, date, text, int, jsonb) to authenticated;

do $$
begin
  raise notice 'D1 lista: fn_crear_factura(...) para la compra en 1 paso.';
end $$;
