-- =============================================================================
-- Control de retiros de caja: se importa el Excel de QuPOS (retiros de la caja
-- de una sucursal) y se coteja cada retiro contra los gastos ya registrados en
-- el ERP (pagados de una cuenta de caja 11-10-10-*), por fecha + monto. Cada
-- retiro queda pendiente / ingresado (enlazado a su gasto) / n/a. El avance
-- alimenta el requisito "Retiros de las cajas" del cierre mensual.
-- Sin llave única en el Excel (el folio 'Control caja' se repite) -> se usa una
-- huella del conjunto de campos para no duplicar al reimportar.
-- =============================================================================

create table public.retiro_caja (
  id          uuid primary key default gen_random_uuid(),
  centro_id   uuid not null references public.centros_costo(id),
  anio        int not null,
  mes         int not null check (mes between 1 and 12),
  fecha       date not null,
  control_caja text,
  monto       numeric(18,2) not null,
  motivo      text,
  cajero      text,
  caja        text,
  huella      text not null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','ingresado','na')),
  gasto_id    uuid references public.gastos(id),
  nota        text,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
create unique index retiro_caja_huella on public.retiro_caja (huella);
create index retiro_caja_centro_mes on public.retiro_caja (centro_id, anio, mes);
select public.fn_adjuntar_auditoria('public.retiro_caja');

alter table public.retiro_caja enable row level security;
create policy rc_sel on public.retiro_caja for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'));
create policy rc_wr on public.retiro_caja for all to authenticated
  using (public.tengo_permiso('cierre.gestionar')) with check (public.tengo_permiso('cierre.gestionar'));

-- ---------------------------------------------------------------------------
-- Importa filas del Excel (ya parseadas). Cada fila: {fecha, control_caja,
-- monto, motivo, cajero, caja}. Devuelve cuántas entraron y cuántas ya estaban.
-- ---------------------------------------------------------------------------
create or replace function public.fn_importar_retiros(
  p_centro uuid, p_anio int, p_mes int, p_filas jsonb
) returns table(insertados int, duplicados int)
language plpgsql security definer set search_path = public as $$
declare f jsonb; v_h text; v_ins int := 0; v_dup int := 0; v_fecha date; v_monto numeric;
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from public.centros_costo where id = p_centro) then raise exception 'Centro inválido.'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_fecha := (f->>'fecha')::date;
    v_monto := round((f->>'monto')::numeric, 2);
    v_h := md5(p_centro::text || '|' || coalesce(f->>'fecha','') || '|' || coalesce(f->>'control_caja','')
             || '|' || coalesce(f->>'monto','') || '|' || coalesce(f->>'motivo','') || '|' || coalesce(f->>'cajero',''));
    insert into public.retiro_caja (centro_id, anio, mes, fecha, control_caja, monto, motivo, cajero, caja, huella)
      values (p_centro, p_anio, p_mes, v_fecha, nullif(f->>'control_caja',''), v_monto,
              nullif(f->>'motivo',''), nullif(f->>'cajero',''), nullif(f->>'caja',''), v_h)
    on conflict (huella) do nothing;
    if found then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
  end loop;
  return query select v_ins, v_dup;
end $$;
grant execute on function public.fn_importar_retiros(uuid, int, int, jsonb) to authenticated;

create or replace function public.fn_marcar_retiro(p_retiro uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_estado not in ('pendiente','ingresado','na') then raise exception 'Estado inválido.'; end if;
  update public.retiro_caja
    set estado = p_estado, gasto_id = case when p_estado='ingresado' then gasto_id else null end,
        actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_marcar_retiro(uuid, text) to authenticated;

create or replace function public.fn_enlazar_retiro(p_retiro uuid, p_gasto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.retiro_caja
    set gasto_id = p_gasto, estado = 'ingresado', actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_enlazar_retiro(uuid, uuid) to authenticated;

-- Lista los retiros de un mes/centro con su gasto enlazado y una sugerencia
-- automática (gasto de caja con misma fecha±5 días y mismo monto, aún sin usar).
create or replace function public.app_listar_retiros(p_centro uuid, p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, gasto_id uuid, gasto_desc text, gasto_fecha date,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja,
    r.estado, r.gasto_id,
    coalesce(gl.descripcion, gcta.codigo), gl.fecha,
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto
      and (g.centro_costo_id = r.centro_id or g.centro_costo_id is null)
      and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha
    limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where public.soy_administrador() or public.tengo_permiso('cierre.gestionar')
  order by r.fecha, r.control_caja, r.monto;
$$;
grant execute on function public.app_listar_retiros(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Sumar 'retiros_caja' como fuente automática del cierre + recrear fn_cierre_auto.
-- ---------------------------------------------------------------------------
do $$ declare cn text;
begin
  select conname into cn from pg_constraint
  where conrelid = 'public.cierre_requisito'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%auto_fuente%';
  if cn is not null then execute 'alter table public.cierre_requisito drop constraint ' || quote_ident(cn); end if;
end $$;
alter table public.cierre_requisito
  add constraint cierre_requisito_auto_chk
  check (auto_fuente in ('ventas','compras','planilla','conciliacion','retiros_caja'));

update public.cierre_requisito set auto_fuente = 'retiros_caja', requiere_archivo = true
  where codigo = 'caja_retiros';

create or replace function public.fn_cierre_auto(
  p_auto text, p_ini date, p_fin date, p_centro uuid, p_cuenta uuid
) returns table(listo boolean, n int, monto numeric, detalle text)
language plpgsql stable set search_path = public as $$
declare v_n int; v_m numeric; v_pend int; v_hay boolean; v_tot int; v_ing int;
begin
  if p_auto = 'ventas' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.ventas_dia
      where estado='confirmado' and fecha between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'compras' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.facturas_compra
      where estado <> 'anulada' and fecha_emision between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'planilla' then
    select count(*) into v_n from public.planilla
      where fecha between p_ini and p_fin and asiento_id is not null and estado <> 'anulada';
    return query select v_n>0, v_n, null::numeric, null::text;
  elsif p_auto = 'retiros_caja' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing
      from public.retiro_caja where centro_id = p_centro and fecha between p_ini and p_fin;
    if coalesce(v_tot,0) = 0 then
      return query select false, 0, 0::numeric, 'sin_importar'::text;
    else
      return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text;
    end if;
  elsif p_auto = 'conciliacion' then
    select exists (select 1 from public.conciliaciones_banco cb
      where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin)
      into v_hay;
    if not v_hay then
      return query select false, null::int, null::numeric, 'sin_estado'::text;
    else
      select count(*) filter (where l.estado='pendiente') into v_pend
        from public.conciliaciones_banco cb
        join public.estado_cuenta_lineas l on l.conciliacion_id = cb.id
        where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin;
      return query select (coalesce(v_pend,0)=0), v_pend, null::numeric, 'concil'::text;
    end if;
  else
    return query select null::boolean, null::int, null::numeric, null::text;
  end if;
end $$;

do $$ begin raise notice 'control de retiros de caja listo.'; end $$;
