-- =============================================================================
-- Desconciliar debe soltar el GRUPO completo, no una sola línea.
-- Caso 1 libro : N banco (fn_conciliar_grupo): varias líneas del banco apuntan al
-- MISMO movimiento de libros. Si se desconciliaba una sola, las otras seguían
-- amarradas al movimiento → el movimiento de libros no reaparecía como pendiente
-- (queda "matched") y la línea suelta quedaba huérfana en el banco.
-- Ahora se sueltan TODAS las líneas del banco que apuntan a ese movimiento. El
-- caso inverso (N libros : 1 banco) lo cubre el trigger que limpia los extras al
-- poner asiento_linea_id en NULL.
-- =============================================================================

create or replace function public.fn_desconciliar_linea(p_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_mov uuid;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select cb.estado, ecl.asiento_linea_id into v_estado, v_mov
    from public.estado_cuenta_lineas ecl
    join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_linea;
  if v_estado is null then raise exception 'Línea inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  if v_mov is not null then
    -- Soltar todo el grupo: cada línea del banco que apunte al mismo movimiento.
    update public.estado_cuenta_lineas
       set asiento_linea_id = null, estado = 'pendiente'
     where asiento_linea_id = v_mov;
  else
    update public.estado_cuenta_lineas
       set asiento_linea_id = null, estado = 'pendiente'
     where id = p_linea;
  end if;
end $$;
grant execute on function public.fn_desconciliar_linea(uuid) to authenticated;

do $$ begin raise notice 'fn_desconciliar_linea: ahora suelta el grupo completo.'; end $$;
