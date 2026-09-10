-- =============================================================================
-- Conciliación 1 banco : N libros — VARIOS movimientos de libros contra UNA
-- línea del banco. Ej.: el banco cobró de un solo tirón dos pagos a proveedor
-- que en la conta van por asientos separados. Es el caso inverso a
-- fn_conciliar_grupo (1 libro : N banco).
--
-- La liga banco→libros vive en estado_cuenta_lineas.asiento_linea_id, que apunta
-- a UN solo movimiento. Para no romper reportes ni el saldo, el PRIMER movimiento
-- sigue guardándose ahí y los ADICIONALES en una tabla puente
-- (conciliacion_lineas_extra). Un trigger limpia los extras cuando la línea del
-- banco se desconcilia (asiento_linea_id vuelve a NULL), así fn_desconciliar_linea
-- y fn_anular_conciliacion los sueltan sin tocarse.
--
-- Acepta diferencias chicas (redondeo, ≤ p_tolerancia, por defecto ₡100): manda
-- la diferencia a la cuenta de redondeo igual que fn_conciliar_redondeo.
-- =============================================================================

create table if not exists public.conciliacion_lineas_extra (
  linea_banco_id   uuid not null references public.estado_cuenta_lineas(id) on delete cascade,
  asiento_linea_id uuid not null references public.asientos_lineas(id),
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid(),
  primary key (linea_banco_id, asiento_linea_id)
);
-- Un movimiento de libros no se puede reusar como "extra" en dos conciliaciones.
create unique index if not exists conciliacion_lineas_extra_al_unica
  on public.conciliacion_lineas_extra (asiento_linea_id);

alter table public.conciliacion_lineas_extra enable row level security;
create policy cle_sel on public.conciliacion_lineas_extra for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('tesoreria.conciliar'));
create policy cle_wr on public.conciliacion_lineas_extra for all to authenticated
  using (public.tengo_permiso('tesoreria.conciliar')) with check (public.tengo_permiso('tesoreria.conciliar'));

-- Al desconciliar/anular (asiento_linea_id → NULL), soltar los movimientos extra.
create or replace function public.fn_limpiar_extras_conciliacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.conciliacion_lineas_extra where linea_banco_id = new.id;
  return new;
end $$;

drop trigger if exists trg_ecl_limpiar_extras on public.estado_cuenta_lineas;
create trigger trg_ecl_limpiar_extras
  after update of asiento_linea_id on public.estado_cuenta_lineas
  for each row when (new.asiento_linea_id is null and old.asiento_linea_id is not null)
  execute function public.fn_limpiar_extras_conciliacion();

-- === EMPAREJAR VARIOS movimientos de libros con UNA línea del banco ==========
create or replace function public.fn_conciliar_grupo_libros(
  p_linea uuid, p_asiento_lineas uuid[], p_tolerancia numeric default 100
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conc uuid; v_estado text; v_banco uuid; v_fecha date;
  v_l_deb numeric; v_l_cre numeric;
  v_n int; v_confirmadas int; v_distintas int; v_cuenta_movs uuid;
  v_s_deb numeric; v_s_cre numeric; v_usadas int; v_res numeric;
  v_cta_red uuid; v_centro uuid;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  if p_asiento_lineas is null or array_length(p_asiento_lineas, 1) is null then
    raise exception 'No se seleccionó ningún movimiento de libros.';
  end if;

  -- Línea del banco.
  select ecl.conciliacion_id, cb.estado, cb.cuenta_id, cb.fecha_corte, ecl.debito, ecl.credito
    into v_conc, v_estado, v_banco, v_fecha, v_l_deb, v_l_cre
    from public.estado_cuenta_lineas ecl
    join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_linea;
  if v_conc is null then raise exception 'Línea del banco inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  -- Movimientos de libros: existen, confirmados y de la MISMA cuenta bancaria.
  select count(*),
         count(*) filter (where a.estado = 'confirmado'),
         count(distinct l.cuenta_id), (array_agg(distinct l.cuenta_id))[1],
         coalesce(sum(l.debito), 0), coalesce(sum(l.credito), 0)
    into v_n, v_confirmadas, v_distintas, v_cuenta_movs, v_s_deb, v_s_cre
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
   where l.id = any(p_asiento_lineas);
  if v_n <> cardinality(p_asiento_lineas) then
    raise exception 'Algún movimiento de libros no existe.';
  end if;
  if v_confirmadas <> v_n then raise exception 'Todos los movimientos de libros deben estar confirmados.'; end if;
  if v_distintas <> 1 or v_cuenta_movs <> v_banco then
    raise exception 'Los movimientos deben ser todos de la misma cuenta bancaria de la conciliación.';
  end if;

  -- Ninguno ya conciliado (ni como principal ni como extra).
  select count(*) into v_usadas from (
    select asiento_linea_id from public.estado_cuenta_lineas where asiento_linea_id = any(p_asiento_lineas)
    union all
    select asiento_linea_id from public.conciliacion_lineas_extra where asiento_linea_id = any(p_asiento_lineas)
  ) t;
  if v_usadas > 0 then raise exception 'Algún movimiento de libros ya está conciliado con otra línea.'; end if;

  -- Regla: SUM(Haber libros) ↔ débito del banco (sale); SUM(Debe) ↔ crédito (entra).
  -- v_res es el residuo (diferencia) igual que en fn_conciliar_redondeo.
  v_res := round((v_s_cre - v_l_deb) - (v_s_deb - v_l_cre), 2);
  if v_res <> 0 then
    if abs(v_res) > p_tolerancia then
      raise exception 'La suma no calza: banco (D %, C %) vs libros (D %, C %). Diferencia %.',
        v_l_deb, v_l_cre, v_s_deb, v_s_cre, v_res;
    end if;
    select id into v_centro from public.centros_costo where codigo = 'GEN' and activo;
    if v_res > 0 then
      select id into v_cta_red from public.cuentas where codigo = '43-10-04-00-00'; -- Ingresos por redondeo
    else
      select id into v_cta_red from public.cuentas where codigo = '62-09-00-00-00'; -- Gastos por redondeo
    end if;
    if v_cta_red is null or v_centro is null then
      raise exception 'Falta la cuenta de redondeo (43-10-04 / 62-09) o el centro GEN.';
    end if;
    perform public.fn_postear_asiento(
      'diario', v_fecha, 'Redondeo en conciliación bancaria',
      'conciliacion_redondeo', p_linea,
      case when v_res > 0 then jsonb_build_array(
          jsonb_build_object('cuenta_id', v_banco, 'debito', v_res, 'detalle', 'Ajuste por redondeo'),
          jsonb_build_object('cuenta_id', v_cta_red, 'credito', v_res, 'centro_costo_id', v_centro, 'detalle', 'Redondeo conciliación'))
        else jsonb_build_array(
          jsonb_build_object('cuenta_id', v_banco, 'credito', -v_res, 'detalle', 'Ajuste por redondeo'),
          jsonb_build_object('cuenta_id', v_cta_red, 'debito', -v_res, 'centro_costo_id', v_centro, 'detalle', 'Redondeo conciliación'))
    end);
  end if;

  -- Ligar: el primero al FK de la línea del banco; el resto a la tabla de extras.
  update public.estado_cuenta_lineas
     set asiento_linea_id = p_asiento_lineas[1], estado = 'conciliada'
   where id = p_linea;
  insert into public.conciliacion_lineas_extra (linea_banco_id, asiento_linea_id)
    select p_linea, x from unnest(p_asiento_lineas[2:]) as x;
end $$;
grant execute on function public.fn_conciliar_grupo_libros(uuid, uuid[], numeric) to authenticated;

-- Los movimientos que ya están usados como "extra" tampoco se pueden reusar en la
-- conciliación 1:1 ni en la N:1 banco. Se refuerzan las guardas existentes.
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

  select (select count(*) from public.estado_cuenta_lineas where asiento_linea_id = p_asiento_linea and id <> p_linea)
       + (select count(*) from public.conciliacion_lineas_extra where asiento_linea_id = p_asiento_linea)
    into v_ya;
  if v_ya > 0 then raise exception 'Ese movimiento de libros ya está conciliado con otra línea.'; end if;

  if round(v_deb,2) <> round(v_al_cre,2) or round(v_cre,2) <> round(v_al_deb,2) then
    raise exception 'El monto no calza: banco (D %, C %) vs libros (D %, C %).', v_deb, v_cre, v_al_deb, v_al_cre;
  end if;

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = p_linea;
end $$;
grant execute on function public.fn_conciliar_linea(uuid, uuid) to authenticated;

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

  select l.cuenta_id, l.debito, l.credito, a.estado into v_al_cuenta, v_al_deb, v_al_cre, v_al_estado
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id where l.id = p_asiento_linea;
  if v_al_cuenta is null then raise exception 'Movimiento de libros inexistente.'; end if;
  if v_al_estado <> 'confirmado' then raise exception 'El movimiento de libros no está confirmado.'; end if;
  if v_al_cuenta <> v_cuenta then raise exception 'El movimiento no es de la misma cuenta bancaria.'; end if;

  select (select count(*) from public.estado_cuenta_lineas where asiento_linea_id = p_asiento_linea)
       + (select count(*) from public.conciliacion_lineas_extra where asiento_linea_id = p_asiento_linea)
    into v_ya;
  if v_ya > 0 then raise exception 'Ese movimiento de libros ya está conciliado con otra(s) línea(s).'; end if;

  if round(v_sum_deb, 2) <> round(v_al_cre, 2) or round(v_sum_cre, 2) <> round(v_al_deb, 2) then
    raise exception 'La suma no calza: banco (D %, C %) vs libros (D %, C %).', v_sum_deb, v_sum_cre, v_al_deb, v_al_cre;
  end if;

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = any(p_lineas);
end $$;
grant execute on function public.fn_conciliar_grupo(uuid, uuid[]) to authenticated;

do $$ begin raise notice 'fn_conciliar_grupo_libros listo (1 banco : N libros, con redondeo).'; end $$;
