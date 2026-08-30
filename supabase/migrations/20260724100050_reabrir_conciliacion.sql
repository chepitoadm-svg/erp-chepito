-- =============================================================================
-- Reabrir una conciliación marcada como conciliada por error: vuelve a borrador
-- SIN deshacer los emparejamientos (a diferencia de anular). Permite seguir
-- casando líneas.
-- =============================================================================

create or replace function public.fn_reabrir_conciliacion(p_conciliacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.conciliaciones_banco where id = p_conciliacion;
  if v_estado is null then raise exception 'Conciliación inexistente.'; end if;
  if v_estado <> 'conciliada' then raise exception 'Solo se reabre una conciliación conciliada (está %).', v_estado; end if;
  update public.conciliaciones_banco
     set estado = 'borrador', conciliada_en = null, conciliada_por = null,
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_conciliacion;
end $$;
grant execute on function public.fn_reabrir_conciliacion(uuid) to authenticated;

do $$ begin raise notice 'fn_reabrir_conciliacion lista.'; end $$;
