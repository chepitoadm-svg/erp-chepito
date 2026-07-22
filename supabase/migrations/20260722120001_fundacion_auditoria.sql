-- =============================================================================
-- 20260722120001_fundacion_auditoria.sql
-- Extensiones, tabla de auditoría y funciones utilitarias transversales.
-- Base sobre la que se apoyan TODAS las tablas (audit trail, "anular nunca
-- borrar", timestamps). Ver reglas duras en CLAUDE.md.
-- =============================================================================

-- gen_random_uuid()
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Log de auditoría inmutable: quién, cuándo, qué cambió.
-- Solo se INSERTA (vía trigger SECURITY DEFINER). Nadie la edita ni borra.
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabla        text        not null,
  registro_id  text        not null,
  accion       text        not null check (accion in ('insert', 'update', 'delete')),
  usuario_id   uuid,
  datos_antes  jsonb,
  datos_despues jsonb,
  ocurrido_en  timestamptz not null default now()
);

comment on table public.auditoria is
  'Rastro de auditoría de todas las tablas de negocio. Inmutable: solo INSERT vía trigger.';

create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id);
create index auditoria_ocurrido_idx on public.auditoria (ocurrido_en);

-- -----------------------------------------------------------------------------
-- Trigger genérico de auditoría. Se adjunta a cada tabla de negocio.
-- Asume que la tabla tiene una columna `id`.
-- -----------------------------------------------------------------------------
create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    insert into public.auditoria (tabla, registro_id, accion, usuario_id, datos_despues)
    values (tg_table_name, (to_jsonb(new) ->> 'id'), 'insert', v_usuario, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.auditoria (tabla, registro_id, accion, usuario_id, datos_antes, datos_despues)
    values (tg_table_name, (to_jsonb(new) ->> 'id'), 'update', v_usuario, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    -- El borrado físico está prohibido por RLS; esto queda como red de seguridad.
    insert into public.auditoria (tabla, registro_id, accion, usuario_id, datos_antes)
    values (tg_table_name, (to_jsonb(old) ->> 'id'), 'delete', v_usuario, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger para mantener actualizado_en / actualizado_por en cada UPDATE.
-- creado_en / creado_por se resuelven por DEFAULT en cada tabla.
-- -----------------------------------------------------------------------------
create or replace function public.fn_set_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en  := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Adjunta auditoría + timestamp de actualización a una tabla dada.
-- Uso interno de las migraciones para no repetir el boilerplate.
-- -----------------------------------------------------------------------------
create or replace function public.fn_adjuntar_auditoria(p_tabla regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger trg_auditoria after insert or update or delete on %s
       for each row execute function public.fn_auditoria()', p_tabla);
  execute format(
    'create trigger trg_set_actualizado before update on %s
       for each row execute function public.fn_set_actualizado()', p_tabla);
end;
$$;
