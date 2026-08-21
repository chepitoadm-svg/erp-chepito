-- =============================================================================
-- Conciliación N:1 — una línea de libros contra VARIAS líneas del banco.
-- Ej.: en libros hay un solo depósito de 731.600 pero el banco lo registró en
-- tres depósitos que suman 731.600. Se concilian juntos si la SUMA calza.
--
-- Cambio de modelo: se suelta el índice único sobre asiento_linea_id para que
-- varias líneas del banco puedan casar con el mismo movimiento de libros. La
-- integridad se sostiene en las funciones: un movimiento de libros no se puede
-- reusar en dos grupos distintos, y la suma del banco debe calzar exacto.
-- =============================================================================

drop index if exists public.estado_cuenta_asiento_linea_unica;

-- fn_conciliar_linea 1:1: se añade guardia contra reusar un movimiento de libros
-- ya conciliado (antes lo impedía el índice único, ahora eliminado).
create or replace function public.fn_conciliar_linea(p_linea uuid, p_asiento_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_conc uuid; v_estado text; v_cuenta uuid; v_deb numeric; v_cre numeric;
        v_al_cuenta uuid; v_al_deb numeric; v_al_cre numeric; v_al_estado text; v_ya int;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select ecl.conciliacion_id, cb.estado, cb.cuenta_id, ecl.debito, ecl.credito
    into v_conc, v_estado, v_cuenta, v_deb, v_cre
    from public.estado_cuenta_lineas ecl join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_linea;
  if v_conc is null then raise exception 'Línea del banco inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  select l.cuenta_id, l.debito, l.credito, a.estado
    into v_al_cuenta, v_al_deb, v_al_cre, v_al_estado
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
   where l.id = p_asiento_linea;
  if v_al_cuenta is null then raise exception 'Movimiento de libros inexistente.'; end if;
  if v_al_estado <> 'confirmado' then raise exception 'El movimiento de libros no está confirmado.'; end if;
  if v_al_cuenta <> v_cuenta then raise exception 'El movimiento no es de la misma cuenta bancaria.'; end if;

  select count(*) into v_ya from public.estado_cuenta_lineas
   where asiento_linea_id = p_asiento_linea and id <> p_linea;
  if v_ya > 0 then raise exception 'Ese movimiento de libros ya está conciliado con otra línea.'; end if;

  -- Débito del banco (sale) ↔ Haber en libros; Crédito del banco (entra) ↔ Debe.
  if round(v_deb,2) <> round(v_al_cre,2) or round(v_cre,2) <> round(v_al_deb,2) then
    raise exception 'El monto no calza: banco (D %, C %) vs libros (D %, C %).', v_deb, v_cre, v_al_deb, v_al_cre;
  end if;

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = p_linea;
end $$;
grant execute on function public.fn_conciliar_linea(uuid, uuid) to authenticated;

-- === EMPAREJAR un movimiento de libros con VARIAS líneas del banco ===========
create or replace function public.fn_conciliar_grupo(p_asiento_linea uuid, p_lineas uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conc uuid; v_estado text; v_cuenta uuid;
  v_n int; v_distintas int; v_sum_deb numeric; v_sum_cre numeric;
  v_al_cuenta uuid; v_al_deb numeric; v_al_cre numeric; v_al_estado text; v_ya int;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  if p_lineas is null or array_length(p_lineas, 1) is null then
    raise exception 'No se seleccionó ninguna línea del banco.';
  end if;

  -- Todas las líneas del banco: existen, pendientes y de la MISMA conciliación.
  select count(*), count(distinct ecl.conciliacion_id),
         coalesce(sum(ecl.debito), 0), coalesce(sum(ecl.credito), 0)
    into v_n, v_distintas, v_sum_deb, v_sum_cre
    from public.estado_cuenta_lineas ecl
   where ecl.id = any(p_lineas) and ecl.estado = 'pendiente';
  if v_n <> cardinality(p_lineas) then
    raise exception 'Alguna línea del banco no existe o ya está conciliada.';
  end if;
  if v_distintas <> 1 then
    raise exception 'Las líneas del banco deben ser de la misma conciliación.';
  end if;

  select ecl.conciliacion_id, cb.estado, cb.cuenta_id into v_conc, v_estado, v_cuenta
    from public.estado_cuenta_lineas ecl join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_lineas[1];
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  -- Movimiento de libros.
  select l.cuenta_id, l.debito, l.credito, a.estado into v_al_cuenta, v_al_deb, v_al_cre, v_al_estado
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id where l.id = p_asiento_linea;
  if v_al_cuenta is null then raise exception 'Movimiento de libros inexistente.'; end if;
  if v_al_estado <> 'confirmado' then raise exception 'El movimiento de libros no está confirmado.'; end if;
  if v_al_cuenta <> v_cuenta then raise exception 'El movimiento no es de la misma cuenta bancaria.'; end if;

  select count(*) into v_ya from public.estado_cuenta_lineas where asiento_linea_id = p_asiento_linea;
  if v_ya > 0 then raise exception 'Ese movimiento de libros ya está conciliado con otra(s) línea(s).'; end if;

  -- Suma del banco vs libros: SUM(crédito banco) ↔ Debe libros; SUM(débito) ↔ Haber.
  if round(v_sum_deb, 2) <> round(v_al_cre, 2) or round(v_sum_cre, 2) <> round(v_al_deb, 2) then
    raise exception 'La suma no calza: banco (D %, C %) vs libros (D %, C %).', v_sum_deb, v_sum_cre, v_al_deb, v_al_cre;
  end if;

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = any(p_lineas);
end $$;
grant execute on function public.fn_conciliar_grupo(uuid, uuid[]) to authenticated;

do $$ begin raise notice 'fn_conciliar_grupo listo (N:1 banco↔libros).'; end $$;
