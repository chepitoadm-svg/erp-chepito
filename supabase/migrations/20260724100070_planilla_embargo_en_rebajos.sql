-- =============================================================================
-- El embargo es una PARTE del "Total Rebajos" del Excel (viene revuelto). El
-- usuario solo escribe el monto del embargo y el sistema lo separa solo, sin que
-- tenga que restar a mano:
--   Salario devengado (gasto) = base − (rebajos − embargo)   (el embargo SÍ se ganó)
--   Neto al empleado          = base − rebajos + adic − CCSS − adelanto
--   Haber embargos por pagar  = embargo
-- (rebajos = Total Rebajos completo del Excel, embargo ⊆ rebajos)
-- =============================================================================

create or replace function public.fn_planilla_neto(p_planilla uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario_base - rebajos + pago_adicional - ccss_obrero - adelanto), 2), 0)
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
      -- salario devengado = base − (rebajos − embargo): el embargo NO baja el salario
      case when tiene_ccss then (salario_base - rebajos + embargo) else 0 end as ded,
      case when tiene_ccss then cargas_patronal else 0 end as carg,
      (case when not tiene_ccss then (salario_base - rebajos + embargo) else 0 end) + coalesce(pago_adicional,0) as nod
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
         coalesce(round(sum(salario_base - rebajos + pago_adicional - ccss_obrero),2),0)   -- salarios por pagar (embargo se cancela)
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

do $$ begin raise notice 'planilla: embargo es parte de los rebajos (sin resta manual).'; end $$;
