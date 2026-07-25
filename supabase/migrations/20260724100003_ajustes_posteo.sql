-- =============================================================================
-- Fase 3 — Migración 3: infraestructura de posteo automático + ajustes de
-- inventario (con su asiento).
--
-- Aquí el inventario TOCA la contabilidad por primera vez. El asiento nace del
-- documento, en la MISMA transacción (atómico), y lo dispara un usuario de
-- bodega que NO tiene permisos contables: por eso el posteo va por una función
-- SECURITY DEFINER con un bypass controlado del chequeo de permisos.
-- =============================================================================

-- 1. Bypass controlado: el chequeo de permiso de confirmar/anular se salta solo
--    cuando la bandera de posteo automático está encendida (la enciende, local
--    a la transacción, únicamente fn_postear_asiento / fn_anular_asiento_auto).
create or replace function public.fn_asiento_before_update()
returns trigger
language plpgsql
as $$
declare v_auto boolean;
begin
  v_auto := current_setting('app.posteo_automatico', true) = 'on';

  if old.estado <> new.estado then
    if not (
      (old.estado = 'borrador'   and new.estado in ('confirmado','descartado')) or
      (old.estado = 'confirmado' and new.estado = 'anulado')
    ) then
      raise exception 'Transición de estado no permitida: % -> %.', old.estado, new.estado;
    end if;

    if new.estado = 'confirmado' then
      if auth.uid() is not null and not v_auto and not public.tengo_permiso('asientos.confirmar') then
        raise exception 'No tenés permiso para confirmar asientos.';
      end if;
      perform public.fn_exigir_periodo_abierto(new.periodo_id);
      new.confirmado_en  := coalesce(new.confirmado_en, now());
      new.confirmado_por := coalesce(new.confirmado_por, auth.uid());

    elsif new.estado = 'anulado' then
      if auth.uid() is not null and not v_auto and not public.tengo_permiso('asientos.anular') then
        raise exception 'No tenés permiso para anular asientos.';
      end if;
      if old.tipo = 'reversion' then
        raise exception 'Un asiento de reversión no se puede anular.';
      end if;
      new.anulado_en  := coalesce(new.anulado_en, now());
      new.anulado_por := coalesce(new.anulado_por, auth.uid());
    end if;
  end if;

  if old.estado <> 'borrador' then
    if new.fecha       is distinct from old.fecha
    or new.tipo        is distinct from old.tipo
    or new.glosa       is distinct from old.glosa
    or new.periodo_id  is distinct from old.periodo_id
    or new.origen_tipo is distinct from old.origen_tipo
    or new.origen_id   is distinct from old.origen_id then
      raise exception
        'Asiento % está % y es inmutable. Para corregirlo, anulalo por reversión.',
        old.id, old.estado;
    end if;
  end if;

  return new;
end;
$$;

-- La RLS de asientos_insert / asientos_lineas también exige el permiso. Las
-- funciones de posteo son SECURITY DEFINER (dueño postgres) y la RLS no está
-- forzada, así que el dueño la salta. El bypass de arriba es solo para el
-- trigger de confirmar/anular.

-- 2. Centro de costo de una bodega (vía su sucursal).
create or replace function public.fn_centro_de_bodega(p_bodega uuid)
returns uuid
language sql
stable
as $$
  select cc.id
    from public.bodegas b
    join public.centros_costo cc on cc.sucursal_id = b.sucursal_id
   where b.id = p_bodega and cc.activo
   limit 1;
$$;

-- 3. Posteo automático de un asiento a partir de un documento.
--    p_lineas: jsonb array de {cuenta_id, centro_costo_id, debito, credito, detalle}
--    Idempotente: si ya existe un asiento (no anulado) para ese origen, lo devuelve.
create or replace function public.fn_postear_asiento(
  p_tipo        text,
  p_fecha       date,
  p_glosa       text,
  p_origen_tipo text,
  p_origen_id   uuid,
  p_lineas      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_linea jsonb;
  v_n     int := 0;
begin
  -- Idempotencia: no postear dos veces el mismo documento.
  select id into v_id from public.asientos
   where origen_tipo = p_origen_tipo and origen_id = p_origen_id and estado <> 'anulado'
   limit 1;
  if v_id is not null then return v_id; end if;

  perform set_config('app.posteo_automatico', 'on', true);

  insert into public.asientos (tipo, fecha, glosa, origen_tipo, origen_id)
  values (p_tipo, p_fecha, p_glosa, p_origen_tipo, p_origen_id)
  returning id into v_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_n := v_n + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (
      v_id, v_n,
      (v_linea->>'cuenta_id')::uuid,
      nullif(v_linea->>'centro_costo_id','')::uuid,
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      coalesce((v_linea->>'debito')::numeric,0) + coalesce((v_linea->>'credito')::numeric,0),
      nullif(v_linea->>'detalle','')
    );
  end loop;

  update public.asientos set estado = 'confirmado' where id = v_id;

  perform set_config('app.posteo_automatico', 'off', true);
  return v_id;
end;
$$;

-- 4. Anulación del asiento de un documento (con el mismo bypass).
create or replace function public.fn_anular_asiento_auto(p_origen_tipo text, p_origen_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_rev uuid;
begin
  select id into v_id from public.asientos
   where origen_tipo = p_origen_tipo and origen_id = p_origen_id and estado = 'confirmado' limit 1;
  if v_id is null then return null; end if;
  perform set_config('app.posteo_automatico', 'on', true);
  v_rev := public.fn_anular_asiento(v_id, p_motivo);
  perform set_config('app.posteo_automatico', 'off', true);
  return v_rev;
end;
$$;

-- =============================================================================
-- AJUSTES DE INVENTARIO
-- =============================================================================
create table public.ajustes_inventario (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  bodega_id      uuid not null references public.bodegas(id),
  motivo         text not null check (length(btrim(motivo)) > 0),
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz,
  confirmado_por uuid,
  anulado_en     timestamptz,
  anulado_por    uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.ajustes_inventario');

create table public.ajustes_inventario_lineas (
  id          uuid primary key default gen_random_uuid(),
  ajuste_id   uuid not null references public.ajustes_inventario(id) on delete cascade,
  linea       int not null,
  articulo_id uuid not null references public.articulos(id),
  direccion   text not null check (direccion in ('pos','neg')),  -- sobrante / merma
  cantidad    numeric(18,4) not null check (cantidad > 0),        -- magnitud
  detalle     text,
  unique (ajuste_id, linea)
);

create trigger trg_ajustes_no_delete before delete on public.ajustes_inventario
  for each row execute function public.fn_bloquear_delete();

-- Las líneas solo se tocan mientras el ajuste está en borrador.
create or replace function public.fn_ajuste_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.ajuste_id else new.ajuste_id end;
  select estado into v_estado from public.ajustes_inventario where id = v_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'El ajuste está %: sus líneas son inmutables.', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_ajuste_lineas_borrador
  before insert or update or delete on public.ajustes_inventario_lineas
  for each row execute function public.fn_ajuste_lineas_solo_borrador();

-- === CONFIRMAR: genera el kardex y postea el asiento ========================
create or replace function public.fn_confirmar_ajuste(p_ajuste uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; v_centro uuid;
  r record;
  v_pos numeric(18,2) := 0;   -- valor de sobrantes
  v_neg numeric(18,2) := 0;   -- valor de mermas
  v_lineas jsonb := '[]'::jsonb;
  v_cta_inv uuid; v_cta_merma uuid; v_cta_sobra uuid;
  v_asiento uuid;
begin
  select estado, fecha, bodega_id into v_estado, v_fecha, v_bodega
    from public.ajustes_inventario where id = p_ajuste;
  if v_estado is null then raise exception 'Ajuste inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El ajuste ya está %.', v_estado; end if;
  if not exists (select 1 from public.ajustes_inventario_lineas where ajuste_id = p_ajuste) then
    raise exception 'El ajuste no tiene líneas.';
  end if;

  v_centro := public.fn_centro_de_bodega(v_bodega);
  if v_centro is null then raise exception 'La bodega no tiene centro de costo asociado.'; end if;

  select id into v_cta_inv   from public.cuentas where codigo = '11-60-01-00-00';
  select id into v_cta_merma from public.cuentas where codigo = '51-30-01-02-00';
  select id into v_cta_sobra from public.cuentas where codigo = '52-02-00-00-00';

  -- Genera un movimiento de kardex por línea (el motor calcula el costo).
  for r in select * from public.ajustes_inventario_lineas where ajuste_id = p_ajuste order by linea
  loop
    if r.direccion = 'pos' then
      insert into public.movimientos_inventario
        (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha, 'ajuste_pos', r.cantidad, 'ajuste', p_ajuste, r.detalle);
      v_pos := v_pos + (select costo_total from public.movimientos_inventario
                         where origen_tipo='ajuste' and origen_id=p_ajuste and articulo_id=r.articulo_id
                           and tipo='ajuste_pos' order by creado_en desc limit 1);
    else
      insert into public.movimientos_inventario
        (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha, 'ajuste_neg', -r.cantidad, 'ajuste', p_ajuste, r.detalle);
      v_neg := v_neg + abs((select costo_total from public.movimientos_inventario
                             where origen_tipo='ajuste' and origen_id=p_ajuste and articulo_id=r.articulo_id
                               and tipo='ajuste_neg' order by creado_en desc limit 1));
    end if;
  end loop;

  -- Arma el asiento: sobrantes (Debe Inv / Haber 52-02) y mermas (Debe merma / Haber Inv).
  if v_pos > 0 then
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', v_cta_inv,   'debito',  v_pos, 'detalle','Sobrante de inventario')
      || jsonb_build_object('cuenta_id', v_cta_sobra, 'credito', v_pos, 'centro_costo_id', v_centro, 'detalle','Sobrante de inventario');
  end if;
  if v_neg > 0 then
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', v_cta_merma, 'debito',  v_neg, 'centro_costo_id', v_centro, 'detalle','Merma de inventario')
      || jsonb_build_object('cuenta_id', v_cta_inv,   'credito', v_neg, 'detalle','Merma de inventario');
  end if;

  if jsonb_array_length(v_lineas) > 0 then
    v_asiento := public.fn_postear_asiento(
      'diario', v_fecha, 'Ajuste de inventario', 'ajuste', p_ajuste, v_lineas);
  end if;

  update public.ajustes_inventario
     set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_ajuste;

  return v_asiento;
end;
$$;

-- === ANULAR: revierte el kardex (al costo actual) y anula el asiento ========
create or replace function public.fn_anular_ajuste(p_ajuste uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_bodega uuid; r record;
begin
  select estado, bodega_id into v_estado, v_bodega from public.ajustes_inventario where id = p_ajuste;
  if v_estado is null then raise exception 'Ajuste inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un ajuste confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Reversa del kardex, al costo actual (nunca recálculo hacia atrás).
  for r in select articulo_id, tipo, cantidad from public.movimientos_inventario
            where origen_tipo='ajuste' and origen_id=p_ajuste order by creado_en
  loop
    insert into public.movimientos_inventario
      (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (
      r.articulo_id, v_bodega,
      case when r.tipo='ajuste_pos' then 'ajuste_neg' else 'ajuste_pos' end,
      -r.cantidad,  -- signo opuesto
      'ajuste_anulacion', p_ajuste, 'Reversa de ajuste anulado');
  end loop;

  perform public.fn_anular_asiento_auto('ajuste', p_ajuste, p_motivo);

  update public.ajustes_inventario
     set estado='anulado', anulado_en=now(), anulado_por=auth.uid()
   where id = p_ajuste;
end;
$$;

do $$
begin
  raise notice 'Posteo automático y ajustes de inventario listos.';
end $$;
