-- =============================================================================
-- Datos / servicios por centro (panadería): registro flexible de referencia —
-- NIS de agua, NIS de luz, medidores, contratos, teléfonos, etc. Cada dato es
-- una etiqueta libre + valor + nota, colgada de un centro de costo.
-- Es info de referencia (no contable): se puede editar y borrar.
-- =============================================================================

create table public.panaderia_dato (
  id              uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references public.centros_costo(id),
  etiqueta        text not null check (length(btrim(etiqueta)) > 0),
  valor           text,
  nota            text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz, actualizado_por uuid
);
create index panaderia_dato_centro on public.panaderia_dato (centro_costo_id);
select public.fn_adjuntar_auditoria('public.panaderia_dato');

-- Escritura: administrador o quien registra gastos. Lectura: cualquier usuario.
create or replace function public.fn_puede_editar_panaderia() returns boolean
language sql stable security definer set search_path = public as $$
  select public.soy_administrador() or public.tengo_permiso('gastos.registrar');
$$;
grant execute on function public.fn_puede_editar_panaderia() to authenticated;

create or replace function public.fn_guardar_panaderia_dato(
  p_id uuid, p_centro uuid, p_etiqueta text, p_valor text, p_nota text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.fn_puede_editar_panaderia() then raise exception 'No tenés permiso.'; end if;
  if p_centro is null then raise exception 'Elegí la panadería / centro.'; end if;
  if p_etiqueta is null or length(btrim(p_etiqueta)) = 0 then raise exception 'Poné una etiqueta (ej. NIS agua).'; end if;
  if p_id is null then
    insert into public.panaderia_dato (centro_costo_id, etiqueta, valor, nota)
    values (p_centro, btrim(p_etiqueta), nullif(btrim(coalesce(p_valor,'')),''), nullif(btrim(coalesce(p_nota,'')),''))
    returning id into v_id;
  else
    update public.panaderia_dato set
      etiqueta = btrim(p_etiqueta),
      valor = nullif(btrim(coalesce(p_valor,'')),''),
      nota = nullif(btrim(coalesce(p_nota,'')),''),
      actualizado_en = now(), actualizado_por = auth.uid()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Dato inexistente.'; end if;
  end if;
  return v_id;
end $$;
grant execute on function public.fn_guardar_panaderia_dato(uuid, uuid, text, text, text) to authenticated;

create or replace function public.fn_borrar_panaderia_dato(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_puede_editar_panaderia() then raise exception 'No tenés permiso.'; end if;
  delete from public.panaderia_dato where id = p_id;
end $$;
grant execute on function public.fn_borrar_panaderia_dato(uuid) to authenticated;

alter table public.panaderia_dato enable row level security;
create policy pd_sel on public.panaderia_dato for select to authenticated using (true);
create policy pd_wr on public.panaderia_dato for all to authenticated
  using (public.fn_puede_editar_panaderia()) with check (public.fn_puede_editar_panaderia());

do $$ begin raise notice 'panaderia_dato listo.'; end $$;
