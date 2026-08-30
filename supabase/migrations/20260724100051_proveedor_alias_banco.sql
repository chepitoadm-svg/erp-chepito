-- =============================================================================
-- Alias bancarios de proveedores. "Agenda" que liga un identificador que aparece
-- en el estado de cuenta (número de cuenta destino de un TEF, número SINPE, o un
-- pedazo del nombre) con un proveedor. En la conciliación, cada línea del banco
-- muestra de qué proveedor es. Aprende con el uso (se asigna al conciliar) y se
-- administra en su pantalla. Un proveedor puede tener varios alias.
-- =============================================================================

create table public.proveedor_alias_banco (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  alias          text not null,
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  actualizado_en timestamptz,
  actualizado_por uuid
);
-- Un mismo identificador no puede apuntar a dos proveedores.
create unique index proveedor_alias_banco_alias_uk
  on public.proveedor_alias_banco (lower(btrim(alias)));
create index proveedor_alias_banco_prov on public.proveedor_alias_banco (proveedor_id);
comment on table public.proveedor_alias_banco is
  'Liga identificadores del estado de cuenta (cuenta destino de TEF, SINPE, nombre) con un proveedor.';

select public.fn_adjuntar_auditoria('public.proveedor_alias_banco');

alter table public.proveedor_alias_banco enable row level security;
create policy palias_sel on public.proveedor_alias_banco for select to authenticated using (true);
create policy palias_wr on public.proveedor_alias_banco for all to authenticated
  using (public.tengo_permiso('proveedores.gestionar') or public.tengo_permiso('tesoreria.conciliar'))
  with check (public.tengo_permiso('proveedores.gestionar') or public.tengo_permiso('tesoreria.conciliar'));

-- Asigna (o reasigna) un alias a un proveedor. Idempotente por el identificador.
create or replace function public.fn_asignar_alias_proveedor(p_proveedor uuid, p_alias text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_norm text;
begin
  if not (public.tengo_permiso('proveedores.gestionar') or public.tengo_permiso('tesoreria.conciliar')) then
    raise exception 'No tenés permiso para asignar proveedores a cuentas del banco.';
  end if;
  v_norm := btrim(coalesce(p_alias, ''));
  if v_norm = '' then raise exception 'El identificador no puede estar vacío.'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor and estado = 'activo') then
    raise exception 'Elegí un proveedor válido.'; end if;
  select id into v_id from public.proveedor_alias_banco where lower(btrim(alias)) = lower(v_norm);
  if v_id is null then
    insert into public.proveedor_alias_banco (proveedor_id, alias) values (p_proveedor, v_norm) returning id into v_id;
  else
    update public.proveedor_alias_banco
       set proveedor_id = p_proveedor, alias = v_norm, actualizado_en = now(), actualizado_por = auth.uid()
     where id = v_id;
  end if;
  return v_id;
end $$;
grant execute on function public.fn_asignar_alias_proveedor(uuid, text) to authenticated;

-- Borra un alias.
create or replace function public.fn_borrar_alias_proveedor(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.tengo_permiso('proveedores.gestionar') or public.tengo_permiso('tesoreria.conciliar')) then
    raise exception 'No tenés permiso.';
  end if;
  delete from public.proveedor_alias_banco where id = p_id;
end $$;
grant execute on function public.fn_borrar_alias_proveedor(uuid) to authenticated;

do $$ begin raise notice 'proveedor_alias_banco lista.'; end $$;
