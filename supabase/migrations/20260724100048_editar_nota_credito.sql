-- =============================================================================
-- Editar una nota de crédito = anular la vieja + crear una nueva, en una sola
-- transacción (el documento confirmado es inmutable). Solo si el crédito no se
-- aplicó todavía a un pago.
-- =============================================================================

create or replace function public.fn_editar_nota_credito(
  p_nc uuid, p_fecha date, p_cuenta uuid, p_centro uuid,
  p_subtotal numeric, p_iva numeric, p_referencia text, p_glosa text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_estado text; v_prov uuid; v_cxp uuid; v_saldo numeric(18,2); v_mo numeric(18,2); v_new uuid;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, proveedor_id into v_estado, v_prov from public.notas_credito_compra where id = p_nc;
  if v_estado is null then raise exception 'Nota de crédito inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se edita una nota de crédito confirmada (está %).', v_estado; end if;

  select id, saldo, monto_original into v_cxp, v_saldo, v_mo
    from public.cuentas_por_pagar where nota_credito_id = p_nc and tipo='credito';
  if v_cxp is not null and round(v_saldo,2) <> round(v_mo,2) then
    raise exception 'El crédito de esta nota ya se aplicó a un pago. Anulá el pago primero.';
  end if;

  -- Anula la vieja (reversa el asiento y quita el crédito).
  perform public.fn_anular_asiento_auto('nota_credito_compra', p_nc, 'Editado (corrección)');
  if v_cxp is not null then
    update public.cuentas_por_pagar set estado='anulada', saldo=0 where id = v_cxp;
  end if;
  update public.notas_credito_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_nc;

  -- Crea la nueva con los datos corregidos.
  v_new := public.fn_crear_nota_credito(v_prov, p_fecha, p_cuenta, p_centro, p_subtotal, p_iva, p_referencia, p_glosa);
  return v_new;
end $$;
grant execute on function public.fn_editar_nota_credito(uuid, date, uuid, uuid, numeric, numeric, text, text) to authenticated;

do $$ begin raise notice 'fn_editar_nota_credito lista.'; end $$;
