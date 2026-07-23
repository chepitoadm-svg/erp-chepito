-- =============================================================================
-- Anulación por reversión y soporte documental.
--
-- Un asiento confirmado NO se modifica ni se borra: se anula generando su
-- asiento inverso. Ambos quedan ligados y ambos permanecen en el libro. Es lo
-- que sostiene la fiabilidad del registro que exige DGT-R-001-2013.
-- =============================================================================

create table public.asientos_anulaciones (
  id                   uuid primary key default gen_random_uuid(),
  asiento_id           uuid not null unique references public.asientos(id),
  asiento_reversion_id uuid not null unique references public.asientos(id),
  motivo               text not null check (length(btrim(motivo)) > 0),
  -- Se guardan AMBAS fechas: si el periodo original ya estaba cerrado, la
  -- reversión no puede ir a la fecha original y va al primer periodo abierto.
  fecha_original       date not null,
  fecha_reversion      date not null,
  anulado_por          uuid default auth.uid(),
  anulado_en           timestamptz not null default now(),
  constraint anulacion_no_es_su_propia_reversion
    check (asiento_id <> asiento_reversion_id)
);

comment on table public.asientos_anulaciones is
  'Liga cada asiento anulado con su reversión. Guarda fecha original y fecha '
  'de reversión porque pueden diferir si el periodo original estaba cerrado.';

select public.fn_adjuntar_auditoria('public.asientos_anulaciones');

-- === ADJUNTOS ===============================================================
-- Creada desde ya aunque la UI no la use: agregar la relación después obligaría
-- a migrar asientos ya existentes, y un auditor la va a pedir.
create table public.asientos_adjuntos (
  id            uuid primary key default gen_random_uuid(),
  asiento_id    uuid not null references public.asientos(id),
  storage_path  text not null,
  nombre        text not null,
  mime          text,
  tamano_bytes  bigint check (tamano_bytes >= 0),
  subido_por    uuid default auth.uid(),
  subido_en     timestamptz not null default now()
);

comment on table public.asientos_adjuntos is
  'Soporte documental (factura, comprobante) en Supabase Storage. Sin UI todavía.';

create index ix_adjuntos_asiento on public.asientos_adjuntos (asiento_id);

-- =============================================================================
-- FUNCIÓN DE ANULACIÓN
-- =============================================================================
create or replace function public.fn_anular_asiento(
  p_asiento_id uuid,
  p_motivo     text
)
returns uuid
language plpgsql
as $$
declare
  v_estado     text;
  v_tipo       text;
  v_fecha      date;
  v_glosa      text;
  v_periodo    uuid;
  v_per_estado text;
  v_fecha_rev  date;
  v_rev_id     uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'La anulación exige un motivo.';
  end if;

  select estado, tipo, fecha, glosa, periodo_id
    into v_estado, v_tipo, v_fecha, v_glosa, v_periodo
    from public.asientos where id = p_asiento_id;

  if v_estado is null then
    raise exception 'El asiento % no existe.', p_asiento_id;
  end if;
  if v_estado <> 'confirmado' then
    raise exception 'Solo se anula un asiento confirmado (está %).', v_estado;
  end if;
  if v_tipo = 'reversion' then
    raise exception 'Un asiento de reversión es final: no se anula una anulación.';
  end if;

  -- ¿A qué fecha va la reversión? Si el periodo original sigue abierto, a la
  -- misma fecha. Si ya se cerró, al PRIMER periodo abierto.
  select estado into v_per_estado from public.periodos_contables where id = v_periodo;

  if v_per_estado = 'abierto' then
    v_fecha_rev := v_fecha;
  else
    select fecha_inicio into v_fecha_rev
      from public.periodos_contables
     where estado = 'abierto'
     order by anio, mes
     limit 1;
    if v_fecha_rev is null then
      raise exception 'No hay ningún periodo abierto donde registrar la reversión.';
    end if;
  end if;

  -- 1. Cabecera de la reversión (nace en borrador, como todo asiento).
  insert into public.asientos (tipo, fecha, glosa)
  values ('reversion', v_fecha_rev,
          'ANULACIÓN de asiento ' || p_asiento_id::text || ' — ' || btrim(p_motivo))
  returning id into v_rev_id;

  -- 2. Líneas invertidas: débito <-> crédito, misma cuenta y mismo centro.
  insert into public.asientos_lineas
    (asiento_id, linea, cuenta_id, centro_costo_id,
     debito, credito, moneda, tipo_cambio, monto_original, detalle)
  select v_rev_id, l.linea, l.cuenta_id, l.centro_costo_id,
         l.credito, l.debito, l.moneda, l.tipo_cambio, l.monto_original,
         'Reversión: ' || coalesce(l.detalle, '')
    from public.asientos_lineas l
   where l.asiento_id = p_asiento_id
   order by l.linea;

  -- 3. Confirmar la reversión (el trigger diferido valida su cuadre).
  update public.asientos set estado = 'confirmado' where id = v_rev_id;

  -- 4. Marcar el original como anulado y dejar el vínculo.
  update public.asientos set estado = 'anulado' where id = p_asiento_id;

  insert into public.asientos_anulaciones
    (asiento_id, asiento_reversion_id, motivo, fecha_original, fecha_reversion)
  values (p_asiento_id, v_rev_id, btrim(p_motivo), v_fecha, v_fecha_rev);

  return v_rev_id;
end;
$$;

comment on function public.fn_anular_asiento(uuid, text) is
  'Anula un asiento confirmado generando su reversión. Devuelve el id de la '
  'reversión. Si el periodo original está cerrado, la reversión va al primer '
  'periodo abierto y ambas fechas quedan registradas.';

do $$
begin
  raise notice 'Anulación por reversión y adjuntos listos.';
end $$;
