-- =============================================================================
-- Prorrateo que se REHACE solo. Al "Generar" un prorrateo de un centro para un
-- periodo, si ya había uno CONFIRMADO se anula automáticamente (su reversión
-- devuelve el saldo al centro) y los borradores previos se descartan; luego se
-- genera de nuevo con las bases actuales. Así el usuario solo cambia las bases y
-- vuelve a generar, sin tener que anular a mano.
-- La reversión lleva tipo='reversion' (fn_anular_asiento), así que nunca se
-- vuelve a tocar en regeneraciones siguientes.
-- =============================================================================

create or replace function public.fn_generar_prorrateo(p_periodo_id uuid, p_centro_origen_id uuid)
returns uuid language plpgsql as $function$
declare
  v_tipo_o    text;
  v_cod_o     text;
  v_fecha     date;
  v_asiento   uuid;
  v_linea     int := 0;
  v_n_destinos int;
  r_cuenta    record;
  r_dest      record;
  r_prev      record;
  v_pool      numeric(18,2);
  v_acum      numeric(18,2);
  v_monto     numeric(18,2);
  v_i         int;
begin
  select tipo, codigo into v_tipo_o, v_cod_o
    from public.centros_costo where id = p_centro_origen_id;
  if v_tipo_o is null then
    raise exception 'Centro de costo % inexistente.', p_centro_origen_id;
  end if;
  if v_tipo_o <> 'intermedio' then
    raise exception 'Solo se prorratea un centro INTERMEDIO (% es %).', v_cod_o, v_tipo_o;
  end if;

  perform public.fn_exigir_periodo_abierto(p_periodo_id);
  select fecha_fin into v_fecha from public.periodos_contables where id = p_periodo_id;

  select count(*) into v_n_destinos
    from public.prorrateo_bases
   where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id;

  if v_n_destinos = 0 then
    raise exception 'El centro % no tiene bases de prorrateo cargadas para ese periodo.', v_cod_o;
  end if;

  -- Regeneración automática: limpiar el prorrateo previo de este centro/periodo.
  for r_prev in
    select a.id, a.estado
      from public.asientos a
     where a.tipo = 'prorrateo'
       and a.periodo_id = p_periodo_id
       and a.estado in ('confirmado', 'borrador')
       and exists (
         select 1 from public.asientos_lineas l
          where l.asiento_id = a.id and l.centro_costo_id = p_centro_origen_id)
  loop
    if r_prev.estado = 'confirmado' then
      perform public.fn_anular_asiento(r_prev.id, 'Regenerado con nuevas bases de prorrateo');
    else
      update public.asientos set estado = 'descartado' where id = r_prev.id;
    end if;
  end loop;

  insert into public.asientos (tipo, fecha, glosa)
  values ('prorrateo', v_fecha, 'Prorrateo de ' || v_cod_o || ' del periodo')
  returning id into v_asiento;

  for r_cuenta in
    select l.cuenta_id,
           sum(l.debito) - sum(l.credito) as saldo
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
     where a.estado in ('confirmado', 'anulado')
       and a.periodo_id = p_periodo_id
       and l.centro_costo_id = p_centro_origen_id
     group by l.cuenta_id
    having sum(l.debito) - sum(l.credito) <> 0
    order by l.cuenta_id
  loop
    v_pool := r_cuenta.saldo;
    v_acum := 0;
    v_i    := 0;

    for r_dest in
      select b.centro_destino_id, b.porcentaje
        from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id
         and b.centro_origen_id = p_centro_origen_id
       order by b.orden, b.centro_destino_id
    loop
      v_i := v_i + 1;
      if v_i < v_n_destinos then
        v_monto := round(v_pool * r_dest.porcentaje / 100, 2);
        v_acum  := v_acum + v_monto;
      else
        v_monto := v_pool - v_acum;
      end if;

      if v_monto <> 0 then
        v_linea := v_linea + 1;
        insert into public.asientos_lineas
          (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
        values (
          v_asiento, v_linea, r_cuenta.cuenta_id, r_dest.centro_destino_id,
          case when v_monto > 0 then  v_monto else 0 end,
          case when v_monto < 0 then -v_monto else 0 end,
          abs(v_monto),
          'Prorrateo desde ' || v_cod_o
        );
      end if;
    end loop;

    v_linea := v_linea + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (
      v_asiento, v_linea, r_cuenta.cuenta_id, p_centro_origen_id,
      case when v_pool < 0 then -v_pool else 0 end,
      case when v_pool > 0 then  v_pool else 0 end,
      abs(v_pool),
      'Vaciado de ' || v_cod_o
    );
  end loop;

  if v_linea = 0 then
    raise exception 'El centro % no tiene saldo que prorratear en ese periodo.', v_cod_o;
  end if;

  return v_asiento;
end;
$function$;

do $$ begin raise notice 'fn_generar_prorrateo ahora se rehace solo.'; end $$;
