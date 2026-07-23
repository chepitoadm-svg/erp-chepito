-- =============================================================================
-- Asientos contables: libro Diario. El corazón del motor.
--
-- Reglas duras que sostiene esta migración (DGT-R-001-2013 exige que el sistema
-- garantice la seguridad y fiabilidad del registro; esto es lo que la sostiene):
--   - Doble partida forzada en la BASE, no en la pantalla.
--   - Un asiento confirmado es INMUTABLE. Si está mal, se anula por reversión.
--   - Nada se borra. Ni asientos ni líneas.
--   - Todo movimiento deja rastro de quién y cuándo.
--
-- NOTA: la asignación del consecutivo vive en la migración siguiente
-- (...100005_consecutivos), porque necesita su propia tabla contador. Acá el
-- asiento pasa a 'confirmado' sin número; el trigger que lo numera se engancha
-- en esa migración.
-- =============================================================================

-- === TABLA: ASIENTOS ========================================================
create table public.asientos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in
                    ('apertura','diario','ingreso','egreso','prorrateo','cierre','reversion')),
  -- La fecha contable es DATE, nunca timestamptz: Costa Rica es UTC-6 y una
  -- venta de las 7pm del 30 de junio caería en julio si se calculara en UTC.
  fecha           date not null,
  anio            int generated always as (extract(year from fecha)::int) stored,
  numero          int,
  periodo_id      uuid not null references public.periodos_contables(id),
  glosa           text not null check (length(btrim(glosa)) > 0),
  estado          text not null default 'borrador'
                    check (estado in ('borrador','confirmado','anulado','descartado')),
  -- Idempotencia: el POS es offline-first y puede sincronizar dos veces la
  -- misma venta. Ver el índice único más abajo.
  origen_tipo     text,
  origen_id       uuid,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  confirmado_en   timestamptz,
  confirmado_por  uuid,
  anulado_en      timestamptz,
  anulado_por     uuid,
  actualizado_en  timestamptz,
  actualizado_por uuid,
  constraint asientos_origen_completo
    check ((origen_tipo is null) = (origen_id is null)),
  -- Un borrador nunca tiene número (no consume consecutivo si se descarta).
  constraint asientos_numero_segun_estado check (
    (estado in ('borrador','descartado') and numero is null)
    or estado in ('confirmado','anulado')
  )
);

comment on table public.asientos is
  'Libro Diario. Un asiento confirmado es inmutable; corregir = anular por reversión.';
comment on column public.asientos.fecha is
  'Fecha contable. DATE a propósito (CR = UTC-6). El periodo se deriva de acá.';
comment on column public.asientos.numero is
  'Consecutivo por (tipo, anio). Se asigna AL CONFIRMAR, no al crear, para que '
  'un borrador descartado no deje huecos que el auditor pregunte.';

-- Idempotencia del posteo automático. Sin esto, una venta que se sincroniza
-- dos veces se postea dos veces y descuadra ventas contra caja.
create unique index ux_asientos_origen
  on public.asientos (origen_tipo, origen_id)
  where origen_id is not null;

create unique index ux_asientos_numero
  on public.asientos (tipo, anio, numero)
  where numero is not null;

create index ix_asientos_periodo on public.asientos (periodo_id);
create index ix_asientos_fecha   on public.asientos (fecha);
create index ix_asientos_estado  on public.asientos (estado);

select public.fn_adjuntar_auditoria('public.asientos');

-- === TABLA: LÍNEAS ==========================================================
create table public.asientos_lineas (
  id              uuid primary key default gen_random_uuid(),
  asiento_id      uuid not null references public.asientos(id) on delete cascade,
  linea           int not null,
  cuenta_id       uuid not null references public.cuentas(id),
  -- Obligatorio en cuentas de resultado, NULL en las de balance y de orden.
  -- Lo valida fn_validar_linea_asiento.
  centro_costo_id uuid references public.centros_costo(id),
  -- NUMERIC siempre. Un float en contabilidad produce descuadres de céntimos
  -- que el trigger rechaza sin explicación clara.
  debito          numeric(18,2) not null default 0 check (debito  >= 0),
  credito         numeric(18,2) not null default 0 check (credito >= 0),
  -- Moneda: se guarda desde ya aunque hoy no haya cuentas en divisas.
  -- Tipo de cambio de referencia: BCCR tipo VENTA, digitado a mano.
  moneda          text not null default 'CRC' check (length(moneda) = 3),
  tipo_cambio     numeric(18,6) not null default 1 check (tipo_cambio > 0),
  monto_original  numeric(18,2) not null check (monto_original >= 0),
  detalle         text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid,
  unique (asiento_id, linea),
  -- Exactamente uno de los dos. Nada de líneas en cero ni con ambos.
  constraint lineas_debito_xor_credito check (
    (debito > 0 and credito = 0) or (credito > 0 and debito = 0)
  )
);

comment on table public.asientos_lineas is
  'Detalle del asiento. debito/credito SIEMPRE en colones; monto_original y '
  'tipo_cambio conservan la moneda de origen.';

create index ix_lineas_asiento on public.asientos_lineas (asiento_id);
create index ix_lineas_cuenta  on public.asientos_lineas (cuenta_id);
create index ix_lineas_centro  on public.asientos_lineas (centro_costo_id);

select public.fn_adjuntar_auditoria('public.asientos_lineas');

-- =============================================================================
-- VALIDACIÓN DE LÍNEA
-- =============================================================================
create or replace function public.fn_validar_linea_asiento()
returns trigger
language plpgsql
as $$
declare
  v_tipo    text;
  v_acepta  boolean;
  v_estado  text;
  v_ccatvo  boolean;
  v_esperado numeric(18,2);
begin
  select tipo, acepta_movimiento, estado
    into v_tipo, v_acepta, v_estado
    from public.cuentas where id = new.cuenta_id;

  if not found then
    raise exception 'La cuenta % no existe.', new.cuenta_id;
  end if;

  -- No se postea a cuentas de agrupación (p.ej. 31-10-00-00-00 CAPITAL SOCIAL).
  if not v_acepta then
    raise exception 'La cuenta % no acepta movimiento (es de agrupación).',
      (select codigo from public.cuentas where id = new.cuenta_id);
  end if;

  if v_estado <> 'activo' then
    raise exception 'La cuenta % está inactiva.',
      (select codigo from public.cuentas where id = new.cuenta_id);
  end if;

  -- Centro de costo: obligatorio en resultado, prohibido en balance y orden.
  if v_tipo in ('ingreso','gasto') then
    if new.centro_costo_id is null then
      raise exception 'La cuenta % es de resultado y exige centro de costo.',
        (select codigo from public.cuentas where id = new.cuenta_id);
    end if;
    select activo into v_ccatvo from public.centros_costo where id = new.centro_costo_id;
    if not coalesce(v_ccatvo, false) then
      raise exception 'El centro de costo % está inactivo o no existe.', new.centro_costo_id;
    end if;
  else
    if new.centro_costo_id is not null then
      raise exception 'La cuenta % es de balance/orden y NO lleva centro de costo.',
        (select codigo from public.cuentas where id = new.cuenta_id);
    end if;
  end if;

  -- Coherencia moneda / tipo de cambio / monto en colones.
  v_esperado := round(new.monto_original * new.tipo_cambio, 2);
  if v_esperado <> (new.debito + new.credito) then
    raise exception
      'Incoherencia cambiaria en línea %: % x % = % pero el monto en colones es %.',
      new.linea, new.monto_original, new.tipo_cambio, v_esperado, (new.debito + new.credito);
  end if;

  if new.moneda = 'CRC' and new.tipo_cambio <> 1 then
    raise exception 'Una línea en CRC debe tener tipo_cambio = 1.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_linea
  before insert or update on public.asientos_lineas
  for each row execute function public.fn_validar_linea_asiento();

-- =============================================================================
-- CUADRE (DOBLE PARTIDA) — el corazón
--
-- Se valida DIFERIDO (al COMMIT), no fila por fila. Eso resuelve el conflicto
-- con los borradores: un borrador puede estar descuadrado mientras se arma, y
-- solo al quedar 'confirmado' se exige el cuadre.
-- =============================================================================
create or replace function public.fn_validar_cuadre(p_asiento_id uuid)
returns void
language plpgsql
as $$
declare
  v_estado  text;
  v_debitos numeric(18,2);
  v_creditos numeric(18,2);
  v_lineas  int;
  v_orden   int;
begin
  select estado into v_estado from public.asientos where id = p_asiento_id;

  -- Borrador, descartado, o asiento ya eliminado en cascada: no se valida.
  if v_estado is distinct from 'confirmado' then
    return;
  end if;

  select count(*), coalesce(sum(debito),0), coalesce(sum(credito),0)
    into v_lineas, v_debitos, v_creditos
    from public.asientos_lineas where asiento_id = p_asiento_id;

  if v_lineas < 2 then
    raise exception 'Asiento % confirmado con % línea(s): mínimo 2.', p_asiento_id, v_lineas;
  end if;

  if v_debitos <> v_creditos then
    raise exception 'Asiento % DESCUADRADO: débitos % <> créditos % (diferencia %).',
      p_asiento_id, v_debitos, v_creditos, (v_debitos - v_creditos);
  end if;

  -- Cuentas de orden: o todas o ninguna. Mezclarlas con cuentas reales infla
  -- los estados financieros.
  select count(*) into v_orden
    from public.asientos_lineas l
    join public.cuentas c on c.id = l.cuenta_id
   where l.asiento_id = p_asiento_id and c.tipo = 'orden';

  if v_orden > 0 and v_orden <> v_lineas then
    raise exception
      'Asiento %: mezcla % línea(s) de cuentas de orden con % de cuentas reales. '
      'Un asiento es todo de orden o nada.', p_asiento_id, v_orden, (v_lineas - v_orden);
  end if;
end;
$$;

-- Trigger 1: cambios en el DETALLE.
create or replace function public.fn_trg_cuadre_lineas()
returns trigger
language plpgsql
as $$
begin
  perform public.fn_validar_cuadre(
    case when tg_op = 'DELETE' then old.asiento_id else new.asiento_id end
  );
  return null;
end;
$$;

create constraint trigger trg_cuadre_lineas
  after insert or update or delete on public.asientos_lineas
  deferrable initially deferred
  for each row execute function public.fn_trg_cuadre_lineas();

-- Trigger 2: cambios en la CABECERA.
-- Imprescindible: sin este, un simple `update asientos set estado='confirmado'`
-- confirma un asiento descuadrado sin que nada lo detenga, porque las líneas
-- no cambiaron y el trigger 1 nunca dispara. Ese es el bug silencioso.
create or replace function public.fn_trg_cuadre_asiento()
returns trigger
language plpgsql
as $$
begin
  perform public.fn_validar_cuadre(new.id);
  return null;
end;
$$;

create constraint trigger trg_cuadre_asiento
  after insert or update on public.asientos
  deferrable initially deferred
  for each row execute function public.fn_trg_cuadre_asiento();

-- =============================================================================
-- MÁQUINA DE ESTADOS E INMUTABILIDAD
-- =============================================================================
create or replace function public.fn_asiento_before_insert()
returns trigger
language plpgsql
as $$
declare v_periodo uuid;
begin
  -- El periodo se deriva de la fecha contable; si viene, debe coincidir.
  v_periodo := public.fn_periodo_de_fecha(new.fecha);
  if v_periodo is null then
    raise exception 'No existe periodo contable para la fecha %. Generalo con fn_generar_periodos(%).',
      new.fecha, extract(year from new.fecha)::int;
  end if;

  if new.periodo_id is null then
    new.periodo_id := v_periodo;
  elsif new.periodo_id <> v_periodo then
    raise exception 'El periodo indicado no corresponde a la fecha %.', new.fecha;
  end if;

  -- TODO asiento nace en borrador, sin excepción, incluido el posteo
  -- automático del POS. La secuencia es siempre: insertar cabecera borrador ->
  -- insertar líneas -> update a 'confirmado', todo en la misma transacción.
  -- El cuadre se valida igual al COMMIT.
  --
  -- Razón: si un asiento pudiera nacer confirmado, sus líneas no se podrían
  -- insertar (serían inmutables desde el primer instante) y además se saltaría
  -- la máquina de estados. Una sola puerta de entrada, sin casos especiales.
  if new.estado <> 'borrador' then
    raise exception
      'Un asiento nace en borrador (se intentó crear como "%"). Confirmalo con un '
      'UPDATE después de cargar las líneas.', new.estado;
  end if;

  return new;
end;
$$;

-- Se define aparte porque también la usan el cierre y el prorrateo.
create or replace function public.fn_exigir_periodo_abierto(p_periodo_id uuid)
returns void
language plpgsql
as $$
declare v_estado text; v_anio int; v_mes int;
begin
  select estado, anio, mes into v_estado, v_anio, v_mes
    from public.periodos_contables where id = p_periodo_id;
  if v_estado is null then
    raise exception 'Periodo % inexistente.', p_periodo_id;
  end if;
  if v_estado <> 'abierto' then
    raise exception 'El periodo %-% está %. No se puede postear.', v_anio, v_mes, v_estado;
  end if;
end;
$$;

create or replace function public.fn_asiento_before_update()
returns trigger
language plpgsql
as $$
begin
  -- --- Transiciones permitidas -------------------------------------------
  if old.estado <> new.estado then
    if not (
      (old.estado = 'borrador'   and new.estado in ('confirmado','descartado')) or
      (old.estado = 'confirmado' and new.estado = 'anulado')
    ) then
      raise exception 'Transición de estado no permitida: % -> %.', old.estado, new.estado;
    end if;

    if new.estado = 'confirmado' then
      perform public.fn_exigir_periodo_abierto(new.periodo_id);
      new.confirmado_en  := coalesce(new.confirmado_en, now());
      new.confirmado_por := coalesce(new.confirmado_por, auth.uid());
    elsif new.estado = 'anulado' then
      -- Una reversión es final: no se anula una anulación.
      if old.tipo = 'reversion' then
        raise exception 'Un asiento de reversión no se puede anular.';
      end if;
      new.anulado_en  := coalesce(new.anulado_en, now());
      new.anulado_por := coalesce(new.anulado_por, auth.uid());
    end if;
  end if;

  -- --- Inmutabilidad ------------------------------------------------------
  -- Fuera de borrador, los datos de fondo del asiento no se tocan nunca.
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

create trigger trg_asiento_before_insert
  before insert on public.asientos
  for each row execute function public.fn_asiento_before_insert();

create trigger trg_asiento_before_update
  before update on public.asientos
  for each row execute function public.fn_asiento_before_update();

-- Nada se borra. Ni siquiera un borrador: se descarta.
create or replace function public.fn_bloquear_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Prohibido borrar en %. Regla dura: anular/descartar, nunca borrar.', tg_table_name;
end;
$$;

create trigger trg_asientos_no_delete
  before delete on public.asientos
  for each row execute function public.fn_bloquear_delete();

-- Las líneas solo se tocan mientras el asiento está en borrador.
create or replace function public.fn_lineas_solo_en_borrador()
returns trigger
language plpgsql
as $$
declare v_id uuid; v_estado text;
begin
  v_id := case when tg_op = 'DELETE' then old.asiento_id else new.asiento_id end;
  select estado into v_estado from public.asientos where id = v_id;

  -- Si el asiento ya no existe (borrado en cascada, imposible hoy) no bloquea.
  if v_estado is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_estado <> 'borrador' then
    raise exception
      'El asiento está % : sus líneas son inmutables. Corregir = anular por reversión.',
      v_estado;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_lineas_solo_en_borrador
  before insert or update or delete on public.asientos_lineas
  for each row execute function public.fn_lineas_solo_en_borrador();

do $$
begin
  raise notice 'Asientos y líneas creados. Doble partida forzada por constraint trigger diferido.';
end $$;
