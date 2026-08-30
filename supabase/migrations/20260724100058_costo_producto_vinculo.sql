-- =============================================================================
-- Vínculo MANUAL código QuPOS → receta de la app de producción, para el desecho.
-- Cuando el auto-match por nombre no encuentra la receta, el usuario elige a mano
-- cuál va con cuál (desde el tablero de desecho). Se guarda por código y manda
-- sobre el auto-match. Guarda el id del producto de la app de producción; el costo
-- se recalcula solo por receta.
-- =============================================================================

create table public.costo_producto_vinculo (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,        -- código QuPOS
  producto_id      text not null,               -- id del producto en la app de producción
  producto_nombre  text,                        -- nombre de la receta (para mostrar)
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid(),
  actualizado_en   timestamptz,
  actualizado_por  uuid
);
select public.fn_adjuntar_auditoria('public.costo_producto_vinculo');

alter table public.costo_producto_vinculo enable row level security;
create policy cpv_sel on public.costo_producto_vinculo for select to authenticated using (true);
create policy cpv_wr on public.costo_producto_vinculo for all to authenticated
  using (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'))
  with check (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar'));

-- Liga (o re-liga) un código a una receta.
create or replace function public.fn_ligar_costo_producto(p_codigo text, p_producto_id text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  if btrim(coalesce(p_codigo,'')) = '' or btrim(coalesce(p_producto_id,'')) = '' then
    raise exception 'Falta el código o la receta.'; end if;
  insert into public.costo_producto_vinculo (codigo, producto_id, producto_nombre)
  values (btrim(p_codigo), btrim(p_producto_id), nullif(btrim(coalesce(p_nombre,'')),''))
  on conflict (codigo) do update
    set producto_id = excluded.producto_id, producto_nombre = excluded.producto_nombre,
        actualizado_en = now(), actualizado_por = auth.uid();
end $$;
grant execute on function public.fn_ligar_costo_producto(text, text, text) to authenticated;

create or replace function public.fn_desligar_costo_producto(p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.tengo_permiso('reportes.financieros.ver') or public.tengo_permiso('costos.registrar')) then
    raise exception 'No tenés permiso.'; end if;
  delete from public.costo_producto_vinculo where codigo = btrim(p_codigo);
end $$;
grant execute on function public.fn_desligar_costo_producto(text) to authenticated;

do $$ begin raise notice 'costo_producto_vinculo lista.'; end $$;
