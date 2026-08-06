-- =============================================================================
-- Compras — Descuento y desglose "como lo manda el proveedor".
--
-- Para mostrar la factura igual que el documento del proveedor (SUBTOTAL bruto,
-- DESCUENTO, impuesto específico, IVA) hay que conservar las cifras "como
-- facturadas", no solo la base neta que va a inventario. Se agregan por línea:
--   - cantidad_comercial   : cantidad en la unidad del proveedor (antes de convertir a stock)
--   - precio_unitario_lista : precio de lista (antes de descuento)
--   - descuento            : MontoDescuento de la línea
-- Nada de esto cambia el costeo, la base gravable, el IVA, la CxP ni el asiento.
-- =============================================================================

alter table public.facturas_compra_lineas
  add column if not exists cantidad_comercial    numeric(18,4) not null default 0,
  add column if not exists precio_unitario_lista  numeric(18,4) not null default 0,
  add column if not exists descuento              numeric(18,2) not null default 0;

-- Cuando quien inserta NO especifica las cifras comerciales (factura manual y
-- factura de recepción, que se capturan directo en unidad de stock), se rellenan
-- con las de stock para que el desglose se vea consistente (MONTO = base, sin descuento).
create or replace function public.fn_fcl_defaults_comercial()
returns trigger language plpgsql as $$
begin
  if coalesce(new.cantidad_comercial, 0) = 0 then
    new.cantidad_comercial := new.cantidad;
  end if;
  if coalesce(new.precio_unitario_lista, 0) = 0 then
    new.precio_unitario_lista := new.costo_unitario;
  end if;
  return new;
end $$;

drop trigger if exists trg_fcl_defaults on public.facturas_compra_lineas;
create trigger trg_fcl_defaults
  before insert on public.facturas_compra_lineas
  for each row execute function public.fn_fcl_defaults_comercial();

-- Recrear fn_crear_factura_xml para guardar cantidad_comercial, precio_unitario_lista
-- y descuento (el resto queda idéntico a la migración periódica 100019).
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
       base_imponible, iva_tarifa_id, iva_monto, detalle,
       cantidad_comercial, precio_unitario_lista, descuento)
    values (v_id, i, nullif(btrim(coalesce(r->>'codigo_comercial','')),''),
            (r->>'articulo_id')::uuid, (r->>'cantidad')::numeric, (r->>'costo_unitario')::numeric,
            v_base, nullif(btrim(coalesce(r->>'iva_tarifa_id','')),'')::uuid, v_ivam,
            nullif(btrim(coalesce(r->>'detalle','')),''),
            coalesce(nullif(btrim(coalesce(r->>'cantidad_comercial','')),'')::numeric, (r->>'cantidad')::numeric),
            coalesce(nullif(btrim(coalesce(r->>'precio_unitario_lista','')),'')::numeric, 0),
            coalesce(nullif(btrim(coalesce(r->>'descuento','')),'')::numeric, 0));
    v_sub := v_sub + v_base; v_iva := v_iva + v_ivam;
  end loop;

  update public.facturas_compra set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_factura_xml(uuid, uuid, uuid, text, date, text, int, jsonb) to authenticated;
