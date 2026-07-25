-- =============================================================================
-- Fase 3 — Migración 4: transferencias en dos pasos entre bodegas.
--
-- Envío (sale de origen, queda EN TRÁNSITO) -> Recepción (entra a destino).
-- El inventario en tránsito es visible y no se pierde. NO postea asiento: no
-- cambia el valor total del inventario (mismo promedio global).
-- =============================================================================

create table public.transferencias (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  bodega_origen_id  uuid not null references public.bodegas(id),
  bodega_destino_id uuid not null references public.bodegas(id),
  glosa          text,
  -- borrador -> en_transito (enviada) -> recibida ; o anulada
  estado         text not null default 'borrador'
                   check (estado in ('borrador','en_transito','recibida','anulada')),
  enviada_en     timestamptz,
  enviada_por    uuid,
  recibida_en    timestamptz,
  recibida_por   uuid,
  anulada_en     timestamptz,
  anulada_por    uuid,
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  actualizado_en timestamptz,
  actualizado_por uuid,
  constraint transf_origen_distinto_destino check (bodega_origen_id <> bodega_destino_id)
);
select public.fn_adjuntar_auditoria('public.transferencias');

create table public.transferencias_lineas (
  id                  uuid primary key default gen_random_uuid(),
  transferencia_id    uuid not null references public.transferencias(id) on delete cascade,
  linea               int not null,
  articulo_id         uuid not null references public.articulos(id),
  cantidad_enviada    numeric(18,4) not null check (cantidad_enviada > 0),
  cantidad_recibida   numeric(18,4) not null default 0 check (cantidad_recibida >= 0),
  detalle             text,
  unique (transferencia_id, linea),
  -- No se puede recibir más de lo enviado.
  constraint transf_recibida_no_excede check (cantidad_recibida <= cantidad_enviada)
);

create trigger trg_transf_no_delete before delete on public.transferencias
  for each row execute function public.fn_bloquear_delete();

-- Líneas solo editables en borrador.
create or replace function public.fn_transf_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.transferencia_id else new.transferencia_id end;
  select estado into v_estado from public.transferencias where id = v_id;
  -- Se permite el UPDATE de cantidad_recibida durante la recepción (lo hace la
  -- función de recepción); lo demás solo en borrador.
  if v_estado is not null and v_estado not in ('borrador','en_transito') then
    raise exception 'La transferencia está %: sus líneas son inmutables.', v_estado;
  end if;
  if tg_op <> 'UPDATE' and v_estado is not null and v_estado <> 'borrador' then
    raise exception 'Solo se agregan/quitan líneas en borrador (está %).', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_transf_lineas_borrador
  before insert or update or delete on public.transferencias_lineas
  for each row execute function public.fn_transf_lineas_solo_borrador();

-- === PASO 1: ENVIAR =========================================================
-- Saca de la bodega origen; la cantidad queda "en tránsito" (aún no entró a
-- destino). El movimiento transferencia_envio la descuenta de origen.
create or replace function public.fn_enviar_transferencia(p_transf uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_fecha date; v_origen uuid; r record;
begin
  select estado, fecha, bodega_origen_id into v_estado, v_fecha, v_origen
    from public.transferencias where id = p_transf;
  if v_estado is null then raise exception 'Transferencia inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'Solo se envía una transferencia en borrador (está %).', v_estado; end if;
  if not exists (select 1 from public.transferencias_lineas where transferencia_id = p_transf) then
    raise exception 'La transferencia no tiene líneas.';
  end if;

  for r in select * from public.transferencias_lineas where transferencia_id = p_transf order by linea
  loop
    insert into public.movimientos_inventario
      (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_origen, v_fecha, 'transferencia_envio', -r.cantidad_enviada,
            'transferencia', p_transf, 'Envío');
  end loop;

  update public.transferencias
     set estado='en_transito', enviada_en=now(), enviada_por=auth.uid()
   where id = p_transf;
end;
$$;

-- === PASO 2: RECIBIR (total o parcial) ======================================
-- p_recibidas: jsonb array de {linea, cantidad}. Si es null, recibe todo lo
-- enviado. Entra a la bodega destino; lo no recibido queda en tránsito.
create or replace function public.fn_recibir_transferencia(p_transf uuid, p_recibidas jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_fecha date; v_destino uuid; r record; v_recibe numeric(18,4); v_item jsonb;
begin
  select estado, fecha, bodega_destino_id into v_estado, v_fecha, v_destino
    from public.transferencias where id = p_transf;
  if v_estado is null then raise exception 'Transferencia inexistente.'; end if;
  if v_estado <> 'en_transito' then raise exception 'Solo se recibe una transferencia en tránsito (está %).', v_estado; end if;

  for r in select * from public.transferencias_lineas where transferencia_id = p_transf order by linea
  loop
    -- Cuánto se recibe de esta línea: lo indicado, o todo el pendiente.
    if p_recibidas is null then
      v_recibe := r.cantidad_enviada - r.cantidad_recibida;
    else
      v_recibe := 0;
      for v_item in select * from jsonb_array_elements(p_recibidas) loop
        if (v_item->>'linea')::int = r.linea then v_recibe := (v_item->>'cantidad')::numeric; end if;
      end loop;
    end if;

    if v_recibe < 0 then raise exception 'Cantidad recibida negativa en línea %.', r.linea; end if;
    if r.cantidad_recibida + v_recibe > r.cantidad_enviada then
      raise exception 'Línea %: no se puede recibir más de lo enviado.', r.linea;
    end if;

    if v_recibe > 0 then
      insert into public.movimientos_inventario
        (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_destino, v_fecha, 'transferencia_recepcion', v_recibe,
              'transferencia', p_transf, 'Recepción');
      update public.transferencias_lineas
         set cantidad_recibida = cantidad_recibida + v_recibe
       where id = r.id;
    end if;
  end loop;

  -- Si todo lo enviado ya se recibió, la transferencia se cierra.
  if not exists (
    select 1 from public.transferencias_lineas
     where transferencia_id = p_transf and cantidad_recibida < cantidad_enviada
  ) then
    update public.transferencias
       set estado='recibida', recibida_en=now(), recibida_por=auth.uid()
     where id = p_transf;
  end if;
end;
$$;

comment on function public.fn_recibir_transferencia(uuid, jsonb) is
  'Recibe total o parcial. Lo no recibido queda en tránsito hasta una próxima '
  'recepción. La transferencia se cierra cuando todo lo enviado fue recibido.';

-- === INVENTARIO EN TRÁNSITO (vista) =========================================
create or replace view public.v_inventario_transito as
select
  t.id            as transferencia_id,
  t.fecha,
  bo.codigo       as origen,
  bd.codigo       as destino,
  a.codigo        as articulo_codigo,
  a.nombre        as articulo_nombre,
  l.cantidad_enviada,
  l.cantidad_recibida,
  (l.cantidad_enviada - l.cantidad_recibida) as en_transito
from public.transferencias t
join public.transferencias_lineas l on l.transferencia_id = t.id
join public.articulos a  on a.id = l.articulo_id
join public.bodegas bo   on bo.id = t.bodega_origen_id
join public.bodegas bd   on bd.id = t.bodega_destino_id
where t.estado = 'en_transito' and l.cantidad_recibida < l.cantidad_enviada;

comment on view public.v_inventario_transito is
  'Lo que salió de una bodega y todavía no entró a la otra. Visible y no se pierde.';

do $$
begin
  raise notice 'Transferencias en dos pasos listas (con tránsito visible, sin asiento).';
end $$;
