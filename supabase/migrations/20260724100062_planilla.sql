-- =============================================================================
-- MÓDULO PLANILLA (quincenal). Importa el CSV de la app de planilla, se asigna
-- el destino (centro) de cada colaborador y postea el método de 2 pasos:
--   1) PROVISIÓN (gastos de salario contra pasivos), sin tocar el banco.
--   2) PAGO desde el banco contra "Salarios por pagar".
--
-- Reglas del negocio (confirmadas con el usuario):
--  - Con CCSS  -> salario a 61-10-01-08 (deducible) + cargas 61-10-01-06 + CCSS.
--  - Sin CCSS  -> salario a 64-01-03 (Salarios No deducibles).
--  - Días adicionales (pago_adicional) -> SIEMPRE 64-01-03 (no deducible).
--  - Adelantos (faltantes) -> se descuentan del neto contra 11-30-11 (CxC colab.).
--  - Destino por colaborador: TAL / CH1 / CH2 / DIV. DIV = se reparte el total
--    entre CH1 y CH2 según reparto_ch1 (%). El destino se recuerda por colaborador.
--  - Gastos (resultado) llevan centro; pasivos/activo (balance) van sin centro.
-- =============================================================================

-- Memoria del destino por colaborador (para no reasignar cada quincena).
create table public.colaborador_destino (
  clave      text primary key,          -- cédula, o nombre normalizado si no hay cédula
  cedula     text,
  nombre     text,
  destino    text not null check (destino in ('TAL','CH1','CH2','DIV')),
  creado_en  timestamptz not null default now(),
  actualizado_en timestamptz, actualizado_por uuid
);

create table public.planilla (
  id           uuid primary key default gen_random_uuid(),
  titulo       text,
  fecha        date not null,            -- fecha contable de la provisión
  quincena     smallint,                 -- 1 | 2 (informativo)
  reparto_ch1  numeric(5,2) not null default 50,  -- % del pool DIV que va a CH1
  estado       text not null default 'borrador' check (estado in ('borrador','confirmada','anulada')),
  asiento_id       uuid references public.asientos(id),      -- provisión
  pago_asiento_id  uuid references public.asientos(id),      -- pago
  pago_fecha       date,
  pago_cuenta_id   uuid references public.cuentas(id),
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  confirmado_en timestamptz, confirmado_por uuid,
  anulado_en   timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.planilla');

create table public.planilla_lineas (
  id             uuid primary key default gen_random_uuid(),
  planilla_id    uuid not null references public.planilla(id) on delete cascade,
  clave          text,
  cedula         text,
  nombre         text,
  puesto         text,
  tiene_ccss     boolean not null default false,
  destino        text not null default 'DIV' check (destino in ('TAL','CH1','CH2','DIV')),
  salario_base   numeric(18,2) not null default 0,
  ccss_obrero    numeric(18,2) not null default 0,
  cargas_patronal numeric(18,2) not null default 0,
  pago_adicional numeric(18,2) not null default 0,
  adelanto       numeric(18,2) not null default 0,
  creado_en      timestamptz not null default now()
);
create index planilla_lineas_pl on public.planilla_lineas (planilla_id);

-- ------------------------------------------------------------------ guardar --
-- Crea o actualiza una planilla en BORRADOR: reemplaza sus líneas y recuerda el
-- destino de cada colaborador. p_id null = nueva.
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
     salario_base, ccss_obrero, cargas_patronal, pago_adicional, adelanto)
  select v_id, x.clave, x.cedula, x.nombre, x.puesto, coalesce(x.tiene_ccss,false),
         coalesce(nullif(x.destino,''),'DIV'), coalesce(x.salario_base,0), coalesce(x.ccss_obrero,0),
         coalesce(x.cargas_patronal,0), coalesce(x.pago_adicional,0), coalesce(x.adelanto,0)
    from jsonb_to_recordset(coalesce(p_lineas,'[]'::jsonb)) as x(
      clave text, cedula text, nombre text, puesto text, tiene_ccss boolean, destino text,
      salario_base numeric, ccss_obrero numeric, cargas_patronal numeric, pago_adicional numeric, adelanto numeric);

  -- Recordar destino por colaborador.
  insert into public.colaborador_destino (clave, cedula, nombre, destino)
  select distinct on (clave) clave, cedula, nombre, coalesce(nullif(destino,''),'DIV')
    from public.planilla_lineas where planilla_id = v_id and clave is not null and clave <> ''
  on conflict (clave) do update set destino=excluded.destino, nombre=excluded.nombre,
    cedula=excluded.cedula, actualizado_en=now(), actualizado_por=auth.uid();

  return v_id;
end $$;
grant execute on function public.fn_guardar_planilla(uuid, text, date, int, numeric, jsonb) to authenticated;

-- ------------------------------------------------------------------ postear --
-- Postea el asiento de PROVISIÓN (paso 1). Gastos por centro (DIV repartido),
-- pasivos y adelanto agregados.
create or replace function public.fn_postear_planilla(p_planilla uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_tit text; v_p numeric;
  v_ch1 uuid; v_ch2 uuid; v_tal uuid;
  v_c_sal uuid; v_c_nod uuid; v_c_car uuid; v_c_ret uuid; v_c_apo uuid; v_c_adel uuid; v_c_neto uuid;
  r record; v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
  v_ret numeric; v_apo numeric; v_adel numeric; v_neto numeric;
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
  select id into v_c_sal  from public.cuentas where codigo='61-10-01-08-00';
  select id into v_c_nod  from public.cuentas where codigo='64-01-03-00-00';
  select id into v_c_car  from public.cuentas where codigo='61-10-01-06-00';
  select id into v_c_ret  from public.cuentas where codigo='21-10-12-02-00';
  select id into v_c_apo  from public.cuentas where codigo='21-10-12-01-00';
  select id into v_c_adel from public.cuentas where codigo='11-30-11-00-00';
  select id into v_c_neto from public.cuentas where codigo='21-10-11-00-00';

  with l as (
    select destino,
      case when tiene_ccss then salario_base else 0 end as ded,
      case when tiene_ccss then cargas_patronal else 0 end as carg,
      (case when not tiene_ccss then salario_base else 0 end) + coalesce(pago_adicional,0) as nod
    from public.planilla_lineas where planilla_id = p_planilla
  )
  select
    coalesce(sum(ded)  filter (where destino='CH1'),0) ded_ch1, coalesce(sum(ded)  filter (where destino='CH2'),0) ded_ch2,
    coalesce(sum(ded)  filter (where destino='TAL'),0) ded_tal, coalesce(sum(ded)  filter (where destino='DIV'),0) ded_div,
    coalesce(sum(carg) filter (where destino='CH1'),0) car_ch1, coalesce(sum(carg) filter (where destino='CH2'),0) car_ch2,
    coalesce(sum(carg) filter (where destino='TAL'),0) car_tal, coalesce(sum(carg) filter (where destino='DIV'),0) car_div,
    coalesce(sum(nod)  filter (where destino='CH1'),0) nod_ch1, coalesce(sum(nod)  filter (where destino='CH2'),0) nod_ch2,
    coalesce(sum(nod)  filter (where destino='TAL'),0) nod_tal, coalesce(sum(nod)  filter (where destino='DIV'),0) nod_div
  into r from l;

  -- Reparto del pool DIV (CH2 absorbe el residuo para que el total quede exacto).
  ded_ch1 := round(r.ded_ch1 + v_p*r.ded_div, 2); ded_ch2 := round(r.ded_ch2 + r.ded_div - v_p*r.ded_div, 2);
  car_ch1 := round(r.car_ch1 + v_p*r.car_div, 2); car_ch2 := round(r.car_ch2 + r.car_div - v_p*r.car_div, 2);
  nod_ch1 := round(r.nod_ch1 + v_p*r.nod_div, 2); nod_ch2 := round(r.nod_ch2 + r.nod_div - v_p*r.nod_div, 2);

  -- Gastos (con centro). Salarios deducibles.
  if ded_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',ded_ch1,'centro_costo_id',v_ch1,'detalle','Salarios CH1'); end if;
  if ded_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',ded_ch2,'centro_costo_id',v_ch2,'detalle','Salarios CH2'); end if;
  if r.ded_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_sal,'debito',round(r.ded_tal,2),'centro_costo_id',v_tal,'detalle','Salarios Taller'); end if;
  -- Cargas sociales (patronal).
  if car_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',car_ch1,'centro_costo_id',v_ch1,'detalle','Cargas sociales CH1'); end if;
  if car_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',car_ch2,'centro_costo_id',v_ch2,'detalle','Cargas sociales CH2'); end if;
  if r.car_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_car,'debito',round(r.car_tal,2),'centro_costo_id',v_tal,'detalle','Cargas sociales Taller'); end if;
  -- Salarios NO deducibles (sin CCSS + días adicionales).
  if nod_ch1 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',nod_ch1,'centro_costo_id',v_ch1,'detalle','Salarios no deducibles CH1'); end if;
  if nod_ch2 > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',nod_ch2,'centro_costo_id',v_ch2,'detalle','Salarios no deducibles CH2'); end if;
  if r.nod_tal > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_nod,'debito',round(r.nod_tal,2),'centro_costo_id',v_tal,'detalle','Salarios no deducibles Taller'); end if;

  -- Pasivos / activo (sin centro).
  select coalesce(round(sum(ccss_obrero),2),0), coalesce(round(sum(cargas_patronal),2),0), coalesce(round(sum(adelanto),2),0),
         coalesce(round(sum(salario_base + pago_adicional - ccss_obrero - adelanto),2),0)
    into v_ret, v_apo, v_adel, v_neto
    from public.planilla_lineas where planilla_id = p_planilla;

  if v_ret  > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_ret,'credito',v_ret,'detalle','Retención obrera CCSS'); end if;
  if v_apo  > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_apo,'credito',v_apo,'detalle','Aporte patronal CCSS'); end if;
  if v_adel > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_adel,'credito',v_adel,'detalle','Adelantos descontados'); end if;
  if v_neto > 0 then v_lineas := v_lineas || jsonb_build_object('cuenta_id',v_c_neto,'credito',v_neto,'detalle','Salarios por pagar (neto)'); end if;

  v_asiento := public.fn_postear_asiento('diario', v_fecha, coalesce('Planilla '||v_tit,'Planilla'), 'planilla', p_planilla, v_lineas);
  update public.planilla set estado='confirmada', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_planilla;
  return v_asiento;
end $$;
grant execute on function public.fn_postear_planilla(uuid) to authenticated;

-- -------------------------------------------------------------------- pagar --
-- Paso 2: paga el neto (Salarios por pagar) desde un banco.
create or replace function public.fn_pagar_planilla(p_planilla uuid, p_banco uuid, p_fecha date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_estado text; v_tit text; v_neto numeric; v_c_neto uuid; v_asiento uuid; v_lineas jsonb;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  select estado, titulo into v_estado, v_tit from public.planilla where id = p_planilla;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Primero posteá la provisión de la planilla.'; end if;
  if exists (select 1 from public.planilla where id = p_planilla and pago_asiento_id is not null) then
    raise exception 'Esta planilla ya tiene el pago posteado.'; end if;
  if p_banco is null then raise exception 'Elegí la cuenta de banco.'; end if;

  select coalesce(round(sum(salario_base + pago_adicional - ccss_obrero - adelanto),2),0) into v_neto
    from public.planilla_lineas where planilla_id = p_planilla;
  if v_neto <= 0 then raise exception 'No hay neto por pagar.'; end if;

  select id into v_c_neto from public.cuentas where codigo='21-10-11-00-00';
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_c_neto, 'debito',  v_neto, 'detalle','Pago de planilla'),
    jsonb_build_object('cuenta_id', p_banco,  'credito', v_neto, 'detalle','Pago de planilla')
  );
  v_asiento := public.fn_postear_asiento('egreso', p_fecha, coalesce('Pago planilla '||v_tit,'Pago de planilla'), 'planilla_pago', p_planilla, v_lineas);
  update public.planilla set pago_asiento_id=v_asiento, pago_fecha=p_fecha, pago_cuenta_id=p_banco,
    actualizado_en=now(), actualizado_por=auth.uid() where id = p_planilla;
  return v_asiento;
end $$;
grant execute on function public.fn_pagar_planilla(uuid, uuid, date) to authenticated;

-- ------------------------------------------------------------------- anular --
create or replace function public.fn_anular_planilla(p_planilla uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_pago uuid;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  select estado, pago_asiento_id into v_estado, v_pago from public.planilla where id = p_planilla;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'La planilla está %.', v_estado; end if;
  if v_pago is not null then
    perform public.fn_anular_asiento_auto('planilla_pago', p_planilla, p_motivo);
    update public.planilla set pago_asiento_id=null, pago_fecha=null, pago_cuenta_id=null where id = p_planilla;
  end if;
  perform public.fn_anular_asiento_auto('planilla', p_planilla, p_motivo);
  update public.planilla set estado='anulada', anulado_en=now(), anulado_por=auth.uid() where id = p_planilla;
end $$;
grant execute on function public.fn_anular_planilla(uuid, text) to authenticated;

-- ---------------------------------------------------------------------- RLS --
alter table public.colaborador_destino enable row level security;
alter table public.planilla enable row level security;
alter table public.planilla_lineas enable row level security;

create policy cd_sel on public.colaborador_destino for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy cd_wr on public.colaborador_destino for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

create policy pl_sel on public.planilla for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy pl_wr on public.planilla for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

create policy pll_sel on public.planilla_lineas for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy pll_wr on public.planilla_lineas for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

do $$ begin raise notice 'módulo planilla listo.'; end $$;
