-- =============================================================================
-- Fase 3 — Migración 12 (D3): alta atómica de la devolución de compra.
--
-- fn_crear_devolucion: crea la devolución (cabecera borrador + líneas) en UNA
-- transacción. Se devuelve producto de una factura CONFIRMADA, así que el precio
-- (base imponible) y el IVA salen de las líneas de esa factura — el usuario solo
-- elige el artículo y la cantidad a devolver. Igual que el resto, evita
-- borradores huérfanos (devoluciones_compra tiene trg_devc_no_delete).
--
-- El confirmar (fn_confirmar_devolucion, ya existente) baja el inventario AL
-- PROMEDIO, revierte el IVA acreditable, baja la CxP de la factura y manda la
-- diferencia de precio a 51-20-02.
-- =============================================================================

create or replace function public.fn_crear_devolucion(
  p_factura uuid,
  p_bodega  uuid,
  p_motivo  text,
  p_lineas  jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_prov uuid;
  r jsonb;
  i int := 0;
  v_costo numeric(18,4);
  v_tarifa uuid;
  v_pct numeric(5,2);
  v_base numeric(18,2);
  v_ivam numeric(18,2);
  v_sub numeric(18,2) := 0;
  v_iva numeric(18,2) := 0;
begin
  perform public.fn_exigir_permiso('compras.facturar');

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'La devolución exige un motivo.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La devolución no tiene líneas.';
  end if;

  select proveedor_id into v_prov
    from public.facturas_compra where id = p_factura and estado = 'confirmada';
  if v_prov is null then
    raise exception 'La factura no existe o no está confirmada.';
  end if;
  if auth.uid() is not null and not public.soy_administrador()
     and p_bodega not in (select b from public.fn_bodegas_visibles() b) then
    raise exception 'No podés devolver desde esa bodega.';
  end if;

  insert into public.devoluciones_compra
    (proveedor_id, factura_id, bodega_id, motivo, subtotal, iva_total, total)
  values (v_prov, p_factura, p_bodega, btrim(p_motivo), 0, 0, 0)
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    -- Precio e IVA desde la factura (primer renglón del artículo).
    select costo_unitario, iva_tarifa_id into v_costo, v_tarifa
      from public.facturas_compra_lineas
     where factura_id = p_factura and articulo_id = (r->>'articulo_id')::uuid
     order by linea limit 1;
    if v_costo is null then
      raise exception 'El artículo de la línea % no está en la factura.', i;
    end if;

    v_base := round((r->>'cantidad')::numeric * v_costo, 2);
    select porcentaje into v_pct from public.iva_tarifas where id = v_tarifa;
    v_ivam := round(v_base * coalesce(v_pct, 0) / 100.0, 2);

    insert into public.devoluciones_compra_lineas
      (devolucion_id, linea, articulo_id, cantidad, base_imponible, iva_monto, detalle)
    values (v_id, i, (r->>'articulo_id')::uuid, (r->>'cantidad')::numeric,
            v_base, v_ivam, nullif(btrim(coalesce(r->>'detalle','')), ''));

    v_sub := v_sub + v_base;
    v_iva := v_iva + v_ivam;
  end loop;

  update public.devoluciones_compra
     set subtotal = v_sub, iva_total = v_iva, total = v_sub + v_iva
   where id = v_id;

  return v_id;
end $$;

grant execute on function public.fn_crear_devolucion(uuid, uuid, text, jsonb) to authenticated;

do $$
begin
  raise notice 'D3 lista: fn_crear_devolucion(...).';
end $$;
