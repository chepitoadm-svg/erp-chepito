-- =============================================================================
-- "Deshacer" un retiro ya ingresado ahora REVIERTE de verdad el movimiento que
-- generó (pago de planilla, pago a proveedor o gasto): anula su asiento y
-- restaura los saldos, y deja el retiro otra vez pendiente. Antes solo lo
-- desamarraba dejando el movimiento posteado.
-- =============================================================================

create or replace function public.fn_deshacer_retiro(p_retiro uuid, p_motivo text default 'Deshecho desde retiros')
returns void language plpgsql security definer set search_path = public as $$
declare v_g uuid; v_p uuid; v_pp uuid; v_mot text;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  v_mot := coalesce(nullif(btrim(p_motivo), ''), 'Deshecho desde retiros');

  select gasto_id, pago_id, planilla_pago_id into v_g, v_p, v_pp
    from public.retiro_caja where id = p_retiro;

  -- Revertir el movimiento correspondiente (si sigue confirmado).
  if v_pp is not null then perform public.fn_anular_pago_planilla(v_pp, v_mot); end if;
  if v_p  is not null then perform public.fn_anular_pago(v_p, v_mot); end if;
  if v_g  is not null then perform public.fn_anular_gasto(v_g, v_mot); end if;

  update public.retiro_caja
     set estado = 'pendiente', gasto_id = null, pago_id = null, planilla_pago_id = null,
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_retiro;
end $$;
grant execute on function public.fn_deshacer_retiro(uuid, text) to authenticated;

do $$ begin raise notice 'deshacer retiro (revierte movimiento) listo.'; end $$;
