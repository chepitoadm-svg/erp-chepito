-- =============================================================================
-- Fix: no se podía anular una factura cuyo pago YA estaba anulado.
--
-- Al anular un pago, fn_anular_pago inserta una aplicación compensatoria
-- (tipo 'ajuste', origen 'pago_anulacion') y restaura el saldo de la CxP, pero
-- DEJA la aplicación original ('pago'). El guardia de fn_anular_factura solo
-- miraba si EXISTE alguna aplicación, sin ver si netean a cero, así que seguía
-- bloqueando aunque el pago estuviera anulado.
--
-- Se cambia el guardia por la comparación correcta: bloquear solo si la CxP tiene
-- saldo VIVO aplicado (saldo < monto_original). Si el pago se anuló, el saldo
-- vuelve al monto completo y la factura sí se puede anular. Una devolución viva
-- (que sí baja el saldo) sigue bloqueando, como debe ser.
-- =============================================================================

create or replace function public.fn_anular_factura(p_factura uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_recep uuid; v_bodega uuid; r record; v_saldo numeric(18,2); v_monto numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, recepcion_id, bodega_id into v_estado, v_recep, v_bodega from public.facturas_compra where id = p_factura;
  if v_estado is null then raise exception 'Factura inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una factura confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  -- La CxP no puede tener pagos/aplicaciones VIVOS. Si el pago se anuló, su
  -- reversa restauró el saldo al monto original, y entonces sí se puede anular.
  select saldo, monto_original into v_saldo, v_monto from public.cuentas_por_pagar where factura_id = p_factura;
  if v_saldo is not null and v_saldo < v_monto then
    raise exception 'La factura tiene pagos/aplicaciones vivos: revertilos antes de anular.';
  end if;

  -- Reversa del kardex de la factura (compra e ajuste_valor).
  for r in select articulo_id, bodega_id, tipo, cantidad, costo_total from public.movimientos_inventario
            where origen_tipo='factura_compra' and origen_id=p_factura order by creado_en loop
    if r.tipo='compra' then
      insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, r.bodega_id, 'devolucion_compra', -r.cantidad, 'factura_anulacion', p_factura, 'Reversa de factura anulada');
    elsif r.tipo='ajuste_valor' then
      insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, costo_total, origen_tipo, origen_id, detalle)
      values (r.articulo_id, r.bodega_id, 'ajuste_valor', 0, -r.costo_total, 'factura_anulacion', p_factura, 'Reversa de diferencia de precio');
    end if;
  end loop;

  perform public.fn_anular_asiento_auto('factura_compra', p_factura, p_motivo);
  update public.cuentas_por_pagar set estado='anulada', saldo=0 where factura_id = p_factura;
  if v_recep is not null then update public.recepciones set facturada=false where id = v_recep; end if;
  update public.facturas_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_factura;
end $$;
grant execute on function public.fn_anular_factura(uuid, text) to authenticated;

do $$ begin raise notice 'fn_anular_factura: guardia por saldo vivo (permite anular si el pago ya se anuló).'; end $$;
