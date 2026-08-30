-- =============================================================================
-- Permite ELIMINAR (descartar) una planilla en borrador. No es borrado físico:
-- pasa a estado 'descartada' (queda el rastro de auditoría). Una planilla ya
-- posteada NO se descarta: se anula por reversión (fn_anular_planilla).
-- =============================================================================

alter table public.planilla drop constraint if exists planilla_estado_check;
alter table public.planilla add constraint planilla_estado_check
  check (estado in ('borrador','confirmada','anulada','descartada'));

create or replace function public.fn_descartar_planilla(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  select estado into v_estado from public.planilla where id = p_id;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'borrador' then
    raise exception 'Solo se puede eliminar un borrador. Una planilla posteada se anula.'; end if;
  update public.planilla set estado='descartada', anulado_en=now(), anulado_por=auth.uid(),
    actualizado_en=now(), actualizado_por=auth.uid() where id = p_id;
end $$;
grant execute on function public.fn_descartar_planilla(uuid) to authenticated;

do $$ begin raise notice 'descartar planilla (borrador) listo.'; end $$;
