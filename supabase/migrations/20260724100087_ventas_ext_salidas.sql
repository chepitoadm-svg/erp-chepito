-- =============================================================================
-- Salidas de la plata de ventas externas (egresos: compras pagadas, depósitos
-- al banco, adelantos, etc.). Control manual igual que las ventas; NO postea
-- contabilidad. Permite ver Ventas − Salidas = Neto del mes.
-- =============================================================================

create table public.venta_ext_salida (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  descripcion text,
  monto       numeric(18,2) not null check (monto >= 0),
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
create index venta_ext_salida_fecha on public.venta_ext_salida (fecha);
select public.fn_adjuntar_auditoria('public.venta_ext_salida');

alter table public.venta_ext_salida enable row level security;
create policy ves_sel on public.venta_ext_salida for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('ventas.registrar'));
create policy ves_wr on public.venta_ext_salida for all to authenticated
  using (public.tengo_permiso('ventas.registrar')) with check (public.tengo_permiso('ventas.registrar'));

create or replace function public.app_salidas_ext_mes(p_anio int, p_mes int)
returns table(id uuid, fecha date, descripcion text, monto numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.fecha, s.descripcion, s.monto
  from public.venta_ext_salida s
  where (public.soy_administrador() or public.tengo_permiso('ventas.registrar'))
    and extract(year from s.fecha)::int = p_anio and extract(month from s.fecha)::int = p_mes
  order by s.fecha, s.creado_en;
$$;
grant execute on function public.app_salidas_ext_mes(int, int) to authenticated;

create or replace function public.fn_guardar_salida_ext(p_id uuid, p_fecha date, p_descripcion text, p_monto numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_fecha is null then raise exception 'Poné la fecha.'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_id is null then
    insert into public.venta_ext_salida (fecha, descripcion, monto)
      values (p_fecha, nullif(btrim(coalesce(p_descripcion,'')),''), round(p_monto,2)) returning id into v_id;
    return v_id;
  else
    update public.venta_ext_salida
      set fecha = p_fecha, descripcion = nullif(btrim(coalesce(p_descripcion,'')),''), monto = round(p_monto,2),
          actualizado_en = now(), actualizado_por = auth.uid()
    where id = p_id;
    return p_id;
  end if;
end $$;
grant execute on function public.fn_guardar_salida_ext(uuid, date, text, numeric) to authenticated;

create or replace function public.fn_borrar_salida_ext(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  delete from public.venta_ext_salida where id = p_id;
end $$;
grant execute on function public.fn_borrar_salida_ext(uuid) to authenticated;

do $$ begin raise notice 'salidas de ventas externas listo.'; end $$;
