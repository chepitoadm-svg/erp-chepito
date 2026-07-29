-- =============================================================================
-- Fase 3 — Migración 13 (D2): recepción separada (flujo de compra en 2 tiempos).
--
-- (a) fn_crear_recepcion: recibir mercadería SIN factura todavía (cabecera
--     borrador + líneas, atómico). Al confirmar (fn_confirmar_recepcion, ya
--     existente) ingresa el inventario y postea Debe Inventario / Haber
--     "Mercadería recibida por facturar" (21-10-25, cuenta puente).
--
-- (b) fn_crear_factura_recepcion: la factura llega después y SALDA una recepción
--     confirmada (caso B). Proveedor y bodega salen de la recepción; el usuario
--     entra las líneas de la factura (que pueden traer diferencia de precio).
--     Al confirmar (fn_confirmar_factura, caso B ya existente) salda el puente,
--     ajusta el valor del inventario por la diferencia y crea la CxP.
--
-- Se deja intacta fn_crear_factura (caso A, 1 paso) de la migración 100012.
-- =============================================================================

create or replace function public.fn_crear_recepcion(
  p_proveedor uuid,
  p_bodega    uuid,
  p_glosa     text,
  p_lineas    jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; r jsonb; i int := 0;
begin
  perform public.fn_exigir_permiso('compras.recibir');

  if p_bodega is null then raise exception 'La recepción exige la bodega de ingreso.'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La recepción no tiene líneas.'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor and estado = 'activo') then
    raise exception 'El proveedor no existe o está inactivo.'; end if;
  if auth.uid() is not null and not public.soy_administrador()
     and p_bodega not in (select b from public.fn_bodegas_visibles() b) then
    raise exception 'No podés recibir en esa bodega.'; end if;

  insert into public.recepciones (proveedor_id, bodega_id, glosa)
  values (p_proveedor, p_bodega, nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into public.recepciones_lineas
      (recepcion_id, linea, articulo_id, cantidad, costo_unitario, detalle)
    values (v_id, i, (r->>'articulo_id')::uuid, (r->>'cantidad')::numeric,
            (r->>'costo_unitario')::numeric, nullif(btrim(coalesce(r->>'detalle','')),''));
  end loop;

  return v_id;
end $$;

grant execute on function public.fn_crear_recepcion(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.fn_crear_factura_recepcion(
  p_recepcion     uuid,
  p_clave         text,
  p_fecha_emision date,
  p_condicion     text,
  p_plazo         int,
  p_lineas        jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_prov uuid; v_bodega uuid; v_estado text; v_fact boolean;
  v_fecha date; v_venc date;
  v_sub numeric(18,2) := 0; v_iva numeric(18,2) := 0;
  r jsonb; i int := 0; v_base numeric(18,2); v_pct numeric(5,2); v_ivam numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');

  select proveedor_id, bodega_id, estado, facturada
    into v_prov, v_bodega, v_estado, v_fact
    from public.recepciones where id = p_recepcion;
  if v_estado is null then raise exception 'Recepción inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'La recepción no está confirmada (está %).', v_estado; end if;
  if v_fact then raise exception 'La recepción ya fue facturada.'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La factura no tiene líneas.'; end if;

  v_fecha := coalesce(p_fecha_emision, (now() at time zone 'America/Costa_Rica')::date);
  v_venc  := v_fecha + coalesce(p_plazo, 0);

  insert into public.facturas_compra
    (proveedor_id, bodega_id, recepcion_id, clave, fecha_emision,
     condicion_venta, plazo_credito, fecha_vencimiento, subtotal, iva_total, total)
  values (v_prov, v_bodega, p_recepcion, nullif(btrim(coalesce(p_clave,'')),''), v_fecha,
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

  update public.facturas_compra
     set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva
   where id = v_id;

  return v_id;
end $$;

grant execute on function public.fn_crear_factura_recepcion(uuid, text, date, text, int, jsonb) to authenticated;

do $$
begin
  raise notice 'D2 lista: fn_crear_recepcion(...) y fn_crear_factura_recepcion(...).';
end $$;
