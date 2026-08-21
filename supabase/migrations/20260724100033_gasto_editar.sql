-- =============================================================================
-- Editar gasto en BORRADOR. Los confirmados no se editan a nivel de BD (el
-- asiento es inmutable): la corrección se hace en la capa de acción anulando el
-- viejo y creando el corregido. Acá solo se permite actualizar un borrador.
-- =============================================================================

create or replace function public.fn_actualizar_gasto(
  p_gasto uuid, p_centro uuid, p_fecha date, p_cuenta_gasto uuid, p_cuenta_pago uuid,
  p_subtotal numeric, p_iva numeric, p_descripcion text,
  p_proveedor uuid default null, p_vencimiento date default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_sub numeric(18,2); v_iva numeric(18,2); v_cta_pago uuid; v_venc date; v_fecha date;
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  select estado into v_estado from public.gastos where id = p_gasto;
  if v_estado is null then raise exception 'Gasto inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'Solo se edita un gasto en borrador (está %).', v_estado; end if;

  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Elegí un centro de costo válido.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_gasto and acepta_movimiento
                   and estado='activo' and tipo in ('gasto','ingreso')) then
    raise exception 'La cuenta de gasto no es válida.'; end if;

  v_sub := round(coalesce(p_subtotal,0),2);
  v_iva := round(coalesce(p_iva,0),2);
  if v_sub <= 0 then raise exception 'El monto del gasto debe ser mayor que cero.'; end if;
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);

  if p_proveedor is not null then
    if not exists (select 1 from public.proveedores where id = p_proveedor and estado='activo') then
      raise exception 'Elegí un proveedor válido para el gasto por pagar.'; end if;
    select id into v_cta_pago from public.cuentas where codigo = '21-10-01-00-00';
    v_venc := coalesce(p_vencimiento, v_fecha);
  else
    if not exists (select 1 from public.cuentas where id = p_cuenta_pago and acepta_movimiento
                     and estado='activo' and tipo in ('activo','pasivo')) then
      raise exception 'La cuenta de pago no es válida.'; end if;
    v_cta_pago := p_cuenta_pago;
    v_venc := null;
  end if;

  update public.gastos set
    centro_costo_id = p_centro, fecha = v_fecha, cuenta_gasto_id = p_cuenta_gasto,
    cuenta_pago_id = v_cta_pago, descripcion = nullif(btrim(coalesce(p_descripcion,'')),''),
    subtotal = v_sub, iva = v_iva, total = v_sub + v_iva,
    proveedor_id = p_proveedor, fecha_vencimiento = v_venc,
    actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_gasto;
end $$;
grant execute on function public.fn_actualizar_gasto(uuid, uuid, date, uuid, uuid, numeric, numeric, text, uuid, date) to authenticated;

do $$ begin raise notice 'fn_actualizar_gasto (editar borrador) listo.'; end $$;
