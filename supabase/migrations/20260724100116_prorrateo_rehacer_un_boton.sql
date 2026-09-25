-- =============================================================================
-- "Generar / rehacer" de un solo botón. Antes, si el centro ya tenía un
-- prorrateo CONFIRMADO, fn_generar_prorrateo lanzaba error y el usuario tenía que
-- ir a Asientos a anularlo a mano. Ahora, si existe, lo ANULA automáticamente
-- (anular nunca borrar: fn_anular_asiento deja la reversión y el rastro) y vuelve
-- a generar el borrador con las bases actuales. Un click rehace.
--
-- Además el pool ahora excluye tipo='prorrateo' (no solo 'reversion'), así el
-- pool = gasto operativo real del centro, sin contaminarse con vaciados de
-- prorrateos previos. Consistente con app_cuentas_prorrateo y app_estado_prorrateo.
-- =============================================================================

create or replace function public.fn_generar_prorrateo(p_periodo_id uuid, p_centro_origen_id uuid)
returns uuid language plpgsql as $$
declare
  v_tipo_o text; v_cod_o text; v_fecha date; v_asiento uuid; v_linea int := 0;
  v_modo_cuenta boolean; v_faltan text; r_cuenta record; r_dest record; r_prev record;
  v_cuenta_base uuid; v_n_destinos int; v_pool numeric(18,2); v_acum numeric(18,2);
  v_monto numeric(18,2); v_i int;
begin
  select tipo, codigo into v_tipo_o, v_cod_o from public.centros_costo where id = p_centro_origen_id;
  if v_tipo_o is null then raise exception 'Centro de costo % inexistente.', p_centro_origen_id; end if;
  if v_tipo_o <> 'intermedio' then raise exception 'Solo se prorratea un centro INTERMEDIO (% es %).', v_cod_o, v_tipo_o; end if;

  perform public.fn_exigir_periodo_abierto(p_periodo_id);
  select fecha_fin into v_fecha from public.periodos_contables where id = p_periodo_id;

  -- REHACER: si ya hay prorrateo(s) CONFIRMADO(s) de este centro ese mes, anularlos
  -- automáticamente (deja reversión + rastro). Un prorrateo "es de" un centro por
  -- su línea de vaciado (centro = origen).
  for r_prev in
    select a.id from public.asientos a
     where a.tipo = 'prorrateo' and a.periodo_id = p_periodo_id and a.estado = 'confirmado'
       and exists (select 1 from public.asientos_lineas l where l.asiento_id = a.id and l.centro_costo_id = p_centro_origen_id)
  loop
    perform public.fn_anular_asiento(r_prev.id, 'Rehacer prorrateo de ' || v_cod_o);
  end loop;
  -- Descartar borradores previos de este centro+periodo (rehacer real).
  update public.asientos set estado = 'descartado'
   where tipo = 'prorrateo' and periodo_id = p_periodo_id and estado = 'borrador'
     and exists (select 1 from public.asientos_lineas l where l.asiento_id = asientos.id and l.centro_costo_id = p_centro_origen_id);

  v_modo_cuenta := exists (
    select 1 from public.prorrateo_bases
     where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id and cuenta_id is not null);

  -- Pre-chequeo: cuentas con gasto real (sin prorrateo ni reversión) que no tienen base → avisar.
  select string_agg(cu.codigo || ' ' || cu.nombre, ', ' order by cu.codigo) into v_faltan
    from (
      select l.cuenta_id, sum(l.debito) - sum(l.credito) saldo
        from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
       where a.estado = 'confirmado' and a.tipo not in ('reversion', 'prorrateo')
         and a.periodo_id = p_periodo_id and l.centro_costo_id = p_centro_origen_id
       group by l.cuenta_id having sum(l.debito) - sum(l.credito) <> 0
    ) s join public.cuentas cu on cu.id = s.cuenta_id
   where not exists (
      select 1 from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id and b.centro_origen_id = p_centro_origen_id
         and (b.cuenta_id = s.cuenta_id or (not v_modo_cuenta and b.cuenta_id is null)));
  if v_faltan is not null then
    raise exception 'Faltan bases de prorrateo para: %. Configuralas en Configuración → Prorrateo.', v_faltan;
  end if;

  insert into public.asientos (tipo, fecha, glosa)
  values ('prorrateo', v_fecha, 'Prorrateo de ' || v_cod_o || ' del periodo') returning id into v_asiento;

  for r_cuenta in
    select l.cuenta_id, sum(l.debito) - sum(l.credito) as saldo
      from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado' and a.tipo not in ('reversion', 'prorrateo')
       and a.periodo_id = p_periodo_id and l.centro_costo_id = p_centro_origen_id
     group by l.cuenta_id having sum(l.debito) - sum(l.credito) <> 0
     order by l.cuenta_id
  loop
    if exists (select 1 from public.prorrateo_bases where periodo_id = p_periodo_id
                 and centro_origen_id = p_centro_origen_id and cuenta_id = r_cuenta.cuenta_id) then
      v_cuenta_base := r_cuenta.cuenta_id;
    else
      v_cuenta_base := null;
    end if;
    select count(*) into v_n_destinos from public.prorrateo_bases
      where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id
        and cuenta_id is not distinct from v_cuenta_base;

    v_pool := r_cuenta.saldo; v_acum := 0; v_i := 0;
    for r_dest in
      select b.centro_destino_id, b.porcentaje from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id and b.centro_origen_id = p_centro_origen_id
         and b.cuenta_id is not distinct from v_cuenta_base
       order by b.orden, b.centro_destino_id
    loop
      v_i := v_i + 1;
      if v_i < v_n_destinos then
        v_monto := round(v_pool * r_dest.porcentaje / 100, 2); v_acum := v_acum + v_monto;
      else
        v_monto := v_pool - v_acum;
      end if;
      if v_monto <> 0 then
        v_linea := v_linea + 1;
        insert into public.asientos_lineas (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
        values (v_asiento, v_linea, r_cuenta.cuenta_id, r_dest.centro_destino_id,
                case when v_monto > 0 then v_monto else 0 end, case when v_monto < 0 then -v_monto else 0 end,
                abs(v_monto), 'Prorrateo desde ' || v_cod_o);
      end if;
    end loop;

    v_linea := v_linea + 1;
    insert into public.asientos_lineas (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (v_asiento, v_linea, r_cuenta.cuenta_id, p_centro_origen_id,
            case when v_pool < 0 then -v_pool else 0 end, case when v_pool > 0 then v_pool else 0 end,
            abs(v_pool), 'Vaciado de ' || v_cod_o);
  end loop;

  if v_linea = 0 then raise exception 'El centro % no tiene saldo que prorratear en ese periodo.', v_cod_o; end if;
  return v_asiento;
end;
$$;

do $$ begin raise notice 'fn_generar_prorrateo: rehacer de un botón (auto-anula el confirmado) y pool sin prorrateos.'; end $$;
