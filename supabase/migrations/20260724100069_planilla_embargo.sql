-- =============================================================================
-- Embargo salarial: retención judicial sobre el salario. A diferencia de los
-- rebajos (incapacidad/ausencias, que NO se ganaron y bajan el salario), el
-- embargo SÍ se ganó: no baja el gasto de salario, se retiene del neto y se
-- acredita a "embargos por pagar" (21-10-24-01-00) para girárselo al tercero.
--   Salario devengado (gasto) = base − rebajos          (embargo NO baja el gasto)
--   Neto al empleado          = base − rebajos + adic − CCSS − embargo − adelanto
--   Haber embargos por pagar  = embargo
-- =============================================================================

alter table public.planilla_lineas add column if not exists embargo numeric(18,2) not null default 0;

create or replace function public.fn_guardar_planilla(
  p_id uuid, p_titulo text, p_fecha date, p_quincena int, p_reparto_ch1 numeric, p_lineas jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_estado text;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  if coalesce(p_reparto_ch1,50) < 0 or coalesce(p_reparto_ch1,50) > 100 then
    raise exception 'El reparto a CH1 debe ir entre 0 y 100.'; end if;

  if p_id is null then
    insert into public.planilla (titulo, fecha, quincena, reparto_ch1)
    values (p_titulo, p_fecha, p_quincena, coalesce(p_reparto_ch1,50)) returning id into v_id;
  else
    select estado into v_estado from public.planilla where id = p_id;
    if v_estado is null then raise exception 'Planilla inexistente.'; end if;
    if v_estado <> 'borrador' then raise exception 'La planilla ya está %; no se puede editar.', v_estado; end if;
    update public.planilla set titulo=p_titulo, fecha=p_fecha, quincena=p_quincena,
      reparto_ch1=coalesce(p_reparto_ch1,50), actualizado_en=now(), actualizado_por=auth.uid()
     where id = p_id;
    v_id := p_id;
  end if;

  delete from public.planilla_lineas where planilla_id = v_id;
  insert into public.planilla_lineas
    (planilla_id, clave, cedula, nombre, puesto, tiene_ccss, destino,
     salario_base, ccss_obrero, cargas_patronal, pago_adicional, adelanto, rebajos, embargo)
  select v_id, x.clave, x.cedula, x.nombre, x.puesto, coalesce(x.tiene_ccss,false),
         coalesce(nullif(x.destino,''),'DIV'), coalesce(x.salario_base,0), coalesce(x.ccss_obrero,0),
         coalesce(x.cargas_patronal,0), coalesce(x.pago_adicional,0), coalesce(x.adelanto,0),
         coalesce(x.rebajos,0), coalesce(x.embargo,0)
    from jsonb_to_recordset(coalesce(p_lineas,'[]'::jsonb)) as x(
      clave text, cedula text, nombre text, puesto text, tiene_ccss boolean, destino text,
      salario_base numeric, ccss_obrero numeric, cargas_patronal numeric, pago_adicional numeric,
      adelanto numeric, rebajos numeric, embargo numeric);

  insert into public.colaborador_destino (clave, cedula, nombre, destino)
  select distinct on (clave) clave, cedula, nombre, coalesce(nullif(destino,''),'DIV')
    from public.planilla_lineas where planilla_id = v_id and clave is not null and clave <> ''
  on conflict (clave) do update set destino=excluded.destino, nombre=excluded.nombre,
    cedula=excluded.cedula, actualizado_en=now(), actualizado_por=auth.uid();

  return v_id;
end $$;
grant execute on function public.fn_guardar_planilla(uuid, text, date, int, numeric, jsonb) to authenticated;

create or replace function public.fn_planilla_neto(p_planilla uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario_base - rebajos + pago_adicional - ccss_obrero - embargo - adelanto), 2), 0)
    from public.planilla_lineas where planilla_id = p_planilla;
$$;
grant execute on function public.fn_planilla_neto(uuid) to authenticated;

create or replace function public.fn_postear_planilla(p_planilla uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_tit text; v_p numeric;
  v_ch1 uuid; v_ch2 uuid; v_tal uuid; v_cas uuid;
  v_c_sal uuid; v_c_nod uuid; v_c_car uuid; v_c_ret uuid; v_c_apo uuid; v_c_adel uuid; v_c_neto uuid; v_c_emb uuid;
  r record; v_lineas jsonb := '[]'::jsonb; v_asiento uuid; v_asiento2 uuid;
  v_ret numeric; v_apo numeric; v_adel numeric; v_spp numeric; v_emb numeric;
  ded_ch1 numeric; ded_ch2 numeric; car_ch1 numeric; car_ch2 numeric; nod_ch1 numeric; nod_ch2 numeric;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  select estado, fecha, titulo, coalesce(reparto_ch1,50)/100.0 into v_estado, v_fecha, v_tit, v_p
    from public.planilla where id = p_planilla;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La planilla ya está %.', v_estado; end if;
  if not exists (select 1 from public.planilla_lineas where planilla_id = p_planilla) then
    raise exception 'La planilla no tiene líneas.'; end if;

  select id into v_ch1 from public.centros_costo where codigo='CH1';
  select id into v_ch2 from public.centros_costo where codigo='CH2';
  select id into v_tal from public.centros_costo where codigo='TAL';
  select id into v_cas from public.centros_costo where codigo='CAS';
  select id into v_c_sal  from public.cuentas where codigo='61-10-01-08-00';
  select id into v_c_nod  from public.cuentas where codigo='64-01-03-00-00';
  select id into v_c_car  from public.cuentas where codigo='61-10-01-06-00';
  select id into v_c_ret  from public.cuentas where codigo='21-10-12-02-00';
  select id into v_c_apo  from public.cuentas where codigo='21-10-12-01-00';
  select id into v_c_adel from public.cuentas where codigo='11-30-11-00-00';
  select id into v_c_neto from public.cuentas where codigo='21-10-11-00-00';
  select id into v_c_emb  from public.cuentas where codigo='21-10-24-01-00';

  with l as (
    select destino,
      case when tiene_ccss then (salario_base - rebajos) else 0 end as ded,
      case when tiene_ccss then cargas_patronal else 0 end as carg,
      (case when not tiene_ccss then (salario_base - rebajos) else 0 end) + coalesce(pago_adicional,0) as nod
    from public.planilla_lineas where planilla_id = p_planilla
  )
  select
    coalesce(sum(ded)  filter (where destino='CH1'),0) ded_ch1, coalesce(sum(ded)  filter (where destino='CH2'),0) ded_ch2,
    coalesce(sum(ded)  filter (where destino='TAL'),0) ded_tal, coalesce(sum(ded)  filter (where destino='DIV'),0) ded_div,
    coalesce(sum(ded)  filter (where destino='CAS'),0) ded_cas,
    coalesce(sum(carg) filter (where destino='CH1'),0) car_ch1, coalesce(sum(carg) filter (where destino='CH2'),0) car_ch2,
    coalesce(sum(carg) filter (where destino='TAL'),0) car_tal, coalesce(sum(carg) filter (where destino='DIV'),0) car_div,
    coalesce(sum(carg) filter (where destino='CAS'),0) car_cas,
    coalesce(sum(nod)  filter (where destino='CH1'),0) nod_ch1, coalesce(sum(nod)  filter (where destino='CH2'),0) nod_ch2,
    coalesce(sum(nod)  filter (where destino='TAL'),0) nod_tal, coalesce(sum(nod)  filter (where destino='DIV'),0) nod_div,
    coalesce(sum(nod)  filter (where destino='CAS'),0) nod_cas
  into r from l;

  ded_ch1 := round(r.ded_ch1 + v_p*r.ded_div, 2); ded_ch2 := round(r.ded_ch2 + r.ded_div - v_p*r.ded_div, 2);
  car_ch1 := round(r.car_ch1 + v_p*r.car_div, 2); car_ch2 := round(r.car_ch2 + r.car_div - v_p*r.car_div, 2);
  nod_ch1 := round(r.nod_ch1 + v_p*r.nod_div, 2); nod_ch2 := round(r.nod_ch2 + r.nod_div - v_p*r.nod_div, 2);

  if ded_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',ded_ch1,'centro_costo_id',v_ch1,'detalle','Salarios CH1'); end if;
  if ded_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',ded_ch2,'centro_costo_id',v_ch2,'detalle','Salarios CH2'); end if;
  if r.ded_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',round(r.ded_tal,2),'centro_costo_id',v_tal,'detalle','Salarios Taller'); end if;
  if r.ded_cas > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',round(r.ded_cas,2),'centro_costo_id',v_cas,'detalle','Salarios Casa'); end if;
  if car_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',car_ch1,'centro_costo_id',v_ch1,'detalle','Cargas sociales CH1'); end if;
  if car_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',car_ch2,'centro_costo_id',v_ch2,'detalle','Cargas sociales CH2'); end if;
  if r.car_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',round(r.car_tal,2),'centro_costo_id',v_tal,'detalle','Cargas sociales Taller'); end if;
  if r.car_cas > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',round(r.car_cas,2),'centro_costo_id',v_cas,'detalle','Cargas sociales Casa'); end if;
  if nod_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',nod_ch1,'centro_costo_id',v_ch1,'detalle','Salarios no deducibles CH1'); end if;
  if nod_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',nod_ch2,'centro_costo_id',v_ch2,'detalle','Salarios no deducibles CH2'); end if;
  if r.nod_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',round(r.nod_tal,2),'centro_costo_id',v_tal,'detalle','Salarios no deducibles Taller'); end if;
  if r.nod_cas > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',round(r.nod_cas,2),'centro_costo_id',v_cas,'detalle','Salarios no deducibles Casa'); end if;

  select coalesce(round(sum(ccss_obrero),2),0), coalesce(round(sum(cargas_patronal),2),0), coalesce(round(sum(adelanto),2),0),
         coalesce(round(sum(embargo),2),0),
         coalesce(round(sum(salario_base - rebajos + pago_adicional - ccss_obrero - embargo),2),0)
    into v_ret, v_apo, v_adel, v_emb, v_spp
    from public.planilla_lineas where planilla_id = p_planilla;

  if v_ret > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_ret,'credito',v_ret,'detalle','Retención obrera CCSS'); end if;
  if v_apo > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_apo,'credito',v_apo,'detalle','Aporte patronal CCSS'); end if;
  if v_emb > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_emb,'credito',v_emb,'detalle','Embargo salarial retenido'); end if;
  if v_spp > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_neto,'credito',v_spp,'detalle','Salarios por pagar'); end if;

  v_asiento := public.fn_postear_asiento('diario', v_fecha, coalesce('Planilla '||v_tit,'Planilla'), 'planilla', p_planilla, v_lineas);
  update public.planilla set estado='confirmada', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_planilla;

  if v_adel > 0 then
    v_asiento2 := public.fn_postear_asiento('egreso', v_fecha, coalesce('Adelantos planilla '||v_tit,'Adelantos de planilla'),
      'planilla_adelanto', p_planilla,
      jsonb_build_array(
        jsonb_build_object('cuenta_id', v_c_neto, 'debito',  v_adel, 'detalle','Adelantos ya entregados'),
        jsonb_build_object('cuenta_id', v_c_adel, 'credito', v_adel, 'detalle','Cancela CxC de adelantos')
      ));
    update public.planilla set adelanto_asiento_id = v_asiento2 where id = p_planilla;
  end if;

  return v_asiento;
end $$;
grant execute on function public.fn_postear_planilla(uuid) to authenticated;

do $$ begin raise notice 'planilla: embargo salarial separado como pasivo (no baja el salario).'; end $$;
