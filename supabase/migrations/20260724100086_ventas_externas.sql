-- =============================================================================
-- Control de VENTAS EXTERNAS / mayoreo: una matriz manual día × cliente, igual
-- que el Excel. NO postea contabilidad (es solo un control/detalle). El total
-- del mes se sigue llevando aparte como venta del día del centro VEX.
-- =============================================================================

create table public.venta_ext_cliente (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  orden     int not null default 100,
  activo    boolean not null default true,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.venta_ext_cliente');

create table public.venta_externa (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.venta_ext_cliente(id) on delete cascade,
  fecha      date not null,
  monto      numeric(18,2) not null check (monto >= 0),
  nota       text,
  creado_en timestamptz not null default now(), creado_por uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid,
  unique (cliente_id, fecha)
);
create index venta_externa_fecha on public.venta_externa (fecha);
select public.fn_adjuntar_auditoria('public.venta_externa');

alter table public.venta_ext_cliente enable row level security;
alter table public.venta_externa      enable row level security;
do $$ declare t text;
begin
  foreach t in array array['venta_ext_cliente','venta_externa'] loop
    execute format($f$create policy %I_sel on public.%I for select to authenticated
      using (public.soy_administrador() or public.tengo_permiso('ventas.registrar'))$f$, t, t);
    execute format($f$create policy %I_wr on public.%I for all to authenticated
      using (public.tengo_permiso('ventas.registrar')) with check (public.tengo_permiso('ventas.registrar'))$f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Catálogo de clientes.
-- ---------------------------------------------------------------------------
create or replace function public.app_listar_clientes_ext()
returns setof public.venta_ext_cliente language sql stable security definer set search_path = public as $$
  select * from public.venta_ext_cliente
  where public.soy_administrador() or public.tengo_permiso('ventas.registrar')
  order by orden, nombre;
$$;
grant execute on function public.app_listar_clientes_ext() to authenticated;

create or replace function public.fn_guardar_cliente_ext(p_id uuid, p_nombre text, p_orden int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) < 1 then raise exception 'El nombre es obligatorio.'; end if;
  if p_id is null then
    insert into public.venta_ext_cliente (nombre, orden) values (btrim(p_nombre), coalesce(p_orden,100)) returning id into v_id;
    return v_id;
  else
    update public.venta_ext_cliente set nombre = btrim(p_nombre), orden = coalesce(p_orden,100) where id = p_id;
    return p_id;
  end if;
end $$;
grant execute on function public.fn_guardar_cliente_ext(uuid, text, int) to authenticated;

create or replace function public.fn_desactivar_cliente_ext(p_id uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  update public.venta_ext_cliente set activo = coalesce(p_activo, false) where id = p_id;
end $$;
grant execute on function public.fn_desactivar_cliente_ext(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar una celda (cliente × fecha). Monto 0 => borra la celda.
-- ---------------------------------------------------------------------------
create or replace function public.fn_guardar_venta_ext(p_cliente uuid, p_fecha date, p_monto numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  if coalesce(p_monto,0) <= 0 then
    delete from public.venta_externa where cliente_id = p_cliente and fecha = p_fecha;
  else
    insert into public.venta_externa (cliente_id, fecha, monto) values (p_cliente, p_fecha, round(p_monto,2))
    on conflict (cliente_id, fecha) do update set monto = round(p_monto,2), actualizado_en = now(), actualizado_por = auth.uid();
  end if;
end $$;
grant execute on function public.fn_guardar_venta_ext(uuid, date, numeric) to authenticated;

-- Montos de un mes (cliente_id, día, monto).
create or replace function public.app_ventas_ext_mes(p_anio int, p_mes int)
returns table(cliente_id uuid, dia int, monto numeric)
language sql stable security definer set search_path = public as $$
  select v.cliente_id, extract(day from v.fecha)::int, v.monto
  from public.venta_externa v
  where (public.soy_administrador() or public.tengo_permiso('ventas.registrar'))
    and extract(year from v.fecha)::int = p_anio and extract(month from v.fecha)::int = p_mes;
$$;
grant execute on function public.app_ventas_ext_mes(int, int) to authenticated;

-- Import del Excel: filas {cliente, fecha, monto}. Crea clientes por nombre.
create or replace function public.fn_importar_ventas_ext(p_filas jsonb)
returns table(celdas int, clientes_nuevos int)
language plpgsql security definer set search_path = public as $$
declare f jsonb; v_cli uuid; v_n int := 0; v_new int := 0; v_ord int;
begin
  if not public.tengo_permiso('ventas.registrar') then raise exception 'No tenés permiso.'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_filas,'[]'::jsonb)) loop
    select id into v_cli from public.venta_ext_cliente where lower(nombre) = lower(btrim(f->>'cliente'));
    if v_cli is null then
      select coalesce(max(orden),0)+1 into v_ord from public.venta_ext_cliente;
      insert into public.venta_ext_cliente (nombre, orden) values (btrim(f->>'cliente'), v_ord) returning id into v_cli;
      v_new := v_new + 1;
    end if;
    if coalesce((f->>'monto')::numeric,0) > 0 then
      insert into public.venta_externa (cliente_id, fecha, monto)
        values (v_cli, (f->>'fecha')::date, round((f->>'monto')::numeric,2))
      on conflict (cliente_id, fecha) do update set monto = excluded.monto, actualizado_en = now();
      v_n := v_n + 1;
    end if;
  end loop;
  return query select v_n, v_new;
end $$;
grant execute on function public.fn_importar_ventas_ext(jsonb) to authenticated;

do $$ begin raise notice 'ventas externas listo.'; end $$;
