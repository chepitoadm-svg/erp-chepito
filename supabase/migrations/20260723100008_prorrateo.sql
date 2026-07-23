-- =============================================================================
-- Prorrateo de centros intermedios hacia centros finales.
--
-- El prorrateo es un ASIENTO, no un reporte. Los gastos compartidos caen en los
-- centros intermedios durante el mes y a fin de mes un asiento los vacía hacia
-- los finales. La CUENTA queda neta en cero: solo se mueve el centro de costo.
--
-- Se hace CUENTA POR CUENTA. Prorratear el pool como un solo monto diría cuánto
-- costó el Taller pero no en qué se fue, que es justo la información que se
-- necesita para la rentabilidad por canal.
-- =============================================================================

create table public.prorrateo_bases (
  id                uuid primary key default gen_random_uuid(),
  -- Las bases son POR PERIODO: los porcentajes cambian todos los meses.
  periodo_id        uuid not null references public.periodos_contables(id),
  centro_origen_id  uuid not null references public.centros_costo(id),
  centro_destino_id uuid not null references public.centros_costo(id),
  porcentaje        numeric(7,4) not null check (porcentaje > 0 and porcentaje <= 100),
  -- Siempre 1 en Fase 2. Existe desde ya para habilitar prorrateo en cascada
  -- después sin migrar datos: sería relajar el CHECK de destino y agregar
  -- validación de ciclos.
  orden             int not null default 1 check (orden >= 1),
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  actualizado_en    timestamptz,
  actualizado_por   uuid,
  unique (periodo_id, centro_origen_id, centro_destino_id),
  constraint base_origen_distinto_destino check (centro_origen_id <> centro_destino_id)
);

comment on table public.prorrateo_bases is
  'Porcentajes de reparto por periodo. Un pool se reparte solo si tiene filas '
  'como origen, y solo hacia los destinos que aparezcan acá.';

create index ix_bases_periodo on public.prorrateo_bases (periodo_id);

select public.fn_adjuntar_auditoria('public.prorrateo_bases');

-- === VALIDACIÓN DE TIPOS ====================================================
create or replace function public.fn_validar_base_prorrateo()
returns trigger
language plpgsql
as $$
declare v_to text; v_td text; v_ao boolean; v_ad boolean;
begin
  select tipo, activo into v_to, v_ao from public.centros_costo where id = new.centro_origen_id;
  select tipo, activo into v_td, v_ad from public.centros_costo where id = new.centro_destino_id;

  if v_to <> 'intermedio' then
    raise exception 'El origen de un prorrateo debe ser un centro INTERMEDIO (es %).', v_to;
  end if;
  -- Sin cascada en Fase 2: abre referencias circulares.
  if v_td <> 'final' then
    raise exception 'El destino de un prorrateo debe ser un centro FINAL (es %).', v_td;
  end if;
  if not v_ao or not v_ad then
    raise exception 'No se cargan bases sobre centros inactivos.';
  end if;
  return new;
end;
$$;

create trigger trg_validar_base_prorrateo
  before insert or update on public.prorrateo_bases
  for each row execute function public.fn_validar_base_prorrateo();

-- === LA SUMA ES 100, SIN EXCEPCIÓN ==========================================
-- Nada de repartir 70 y dejar 30 en el intermedio. Si un gasto no debe
-- repartirse, no debe entrar al centro intermedio: se le pone su centro final
-- directo al postearlo.
create or replace function public.fn_validar_suma_bases(p_periodo uuid, p_origen uuid)
returns void
language plpgsql
as $$
declare v_suma numeric(9,4);
begin
  select coalesce(sum(porcentaje), 0) into v_suma
    from public.prorrateo_bases
   where periodo_id = p_periodo and centro_origen_id = p_origen;

  -- 0 filas = el pool no se reparte ese periodo; lo controla requiere_prorrateo.
  if v_suma = 0 then return; end if;

  if v_suma <> 100 then
    raise exception 'Las bases de % en ese periodo suman %, deben sumar exactamente 100.',
      (select codigo from public.centros_costo where id = p_origen), v_suma;
  end if;
end;
$$;

create or replace function public.fn_trg_suma_bases()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_validar_suma_bases(old.periodo_id, old.centro_origen_id);
  else
    perform public.fn_validar_suma_bases(new.periodo_id, new.centro_origen_id);
    if tg_op = 'UPDATE' and (old.periodo_id, old.centro_origen_id)
       is distinct from (new.periodo_id, new.centro_origen_id) then
      perform public.fn_validar_suma_bases(old.periodo_id, old.centro_origen_id);
    end if;
  end if;
  return null;
end;
$$;

-- Diferido: permite cargar las 3 filas de un pool y validar el 100 al COMMIT.
create constraint trigger trg_suma_bases
  after insert or update or delete on public.prorrateo_bases
  deferrable initially deferred
  for each row execute function public.fn_trg_suma_bases();

-- =============================================================================
-- GENERADOR DEL ASIENTO DE PRORRATEO
--
-- Nace en BORRADOR a propósito: se revisa antes de confirmarlo. Si las bases
-- quedaron mal, se descarta y se vuelve a correr. Reutiliza la máquina de
-- estados en vez de inventar una vista previa.
-- =============================================================================
create or replace function public.fn_generar_prorrateo(
  p_periodo_id uuid,
  p_centro_origen_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_tipo_o    text;
  v_cod_o     text;
  v_fecha     date;
  v_asiento   uuid;
  v_linea     int := 0;
  v_n_destinos int;
  r_cuenta    record;
  r_dest      record;
  v_pool      numeric(18,2);
  v_acum      numeric(18,2);
  v_monto     numeric(18,2);
  v_i         int;
begin
  select tipo, codigo into v_tipo_o, v_cod_o
    from public.centros_costo where id = p_centro_origen_id;
  if v_tipo_o is null then
    raise exception 'Centro de costo % inexistente.', p_centro_origen_id;
  end if;
  if v_tipo_o <> 'intermedio' then
    raise exception 'Solo se prorratea un centro INTERMEDIO (% es %).', v_cod_o, v_tipo_o;
  end if;

  perform public.fn_exigir_periodo_abierto(p_periodo_id);
  select fecha_fin into v_fecha from public.periodos_contables where id = p_periodo_id;

  select count(*) into v_n_destinos
    from public.prorrateo_bases
   where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id;

  if v_n_destinos = 0 then
    raise exception 'El centro % no tiene bases de prorrateo cargadas para ese periodo.', v_cod_o;
  end if;

  insert into public.asientos (tipo, fecha, glosa)
  values ('prorrateo', v_fecha, 'Prorrateo de ' || v_cod_o || ' del periodo')
  returning id into v_asiento;

  -- Una pasada por CUENTA: así se conserva el detalle de gastos por canal.
  for r_cuenta in
    select l.cuenta_id,
           sum(l.debito) - sum(l.credito) as saldo
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado'
       and a.periodo_id = p_periodo_id
       and l.centro_costo_id = p_centro_origen_id
     group by l.cuenta_id
    having sum(l.debito) - sum(l.credito) <> 0
    order by l.cuenta_id
  loop
    v_pool := r_cuenta.saldo;
    v_acum := 0;
    v_i    := 0;

    -- Reparto con la REGLA DE REDONDEO: las primeras n-1 se redondean normal y
    -- la última absorbe el residuo. Sin esto el asiento sale descuadrado por
    -- céntimos y el trigger lo rechaza sin explicar por qué.
    for r_dest in
      select b.centro_destino_id, b.porcentaje
        from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id
         and b.centro_origen_id = p_centro_origen_id
       order by b.orden, b.centro_destino_id
    loop
      v_i := v_i + 1;
      if v_i < v_n_destinos then
        v_monto := round(v_pool * r_dest.porcentaje / 100, 2);
        v_acum  := v_acum + v_monto;
      else
        v_monto := v_pool - v_acum;   -- la última absorbe el residuo
      end if;

      if v_monto <> 0 then
        v_linea := v_linea + 1;
        insert into public.asientos_lineas
          (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
        values (
          v_asiento, v_linea, r_cuenta.cuenta_id, r_dest.centro_destino_id,
          case when v_monto > 0 then  v_monto else 0 end,
          case when v_monto < 0 then -v_monto else 0 end,
          abs(v_monto),
          'Prorrateo desde ' || v_cod_o
        );
      end if;
    end loop;

    -- Contrapartida: vacía la cuenta en el centro intermedio.
    v_linea := v_linea + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (
      v_asiento, v_linea, r_cuenta.cuenta_id, p_centro_origen_id,
      case when v_pool < 0 then -v_pool else 0 end,
      case when v_pool > 0 then  v_pool else 0 end,
      abs(v_pool),
      'Vaciado de ' || v_cod_o
    );
  end loop;

  if v_linea = 0 then
    raise exception 'El centro % no tiene saldo que prorratear en ese periodo.', v_cod_o;
  end if;

  return v_asiento;
end;
$$;

comment on function public.fn_generar_prorrateo(uuid, uuid) is
  'Genera el asiento de prorrateo EN BORRADOR, cuenta por cuenta. La última '
  'línea de cada cuenta absorbe el residuo de redondeo.';

-- === SEMILLA: BASES DEL TALLER ==============================================
-- Junio 2026. Las bases del centro GENERAL están PENDIENTES de confirmación y
-- NO se siembran acá a propósito. Mientras GEN tenga requiere_prorrateo = true
-- y no tenga bases, el cierre de periodo va a fallar identificándolo: ese es
-- exactamente el comportamiento buscado (distinguir el olvido de la decisión).
insert into public.prorrateo_bases (periodo_id, centro_origen_id, centro_destino_id, porcentaje)
select p.id, o.id, d.id, v.pct
  from (values ('CH1', 29.6), ('CH2', 39.9), ('VEX', 30.5)) as v(cod, pct)
  join public.centros_costo d on d.codigo = v.cod
  join public.centros_costo o on o.codigo = 'TAL'
  join public.periodos_contables p on p.anio = 2026 and p.mes = 6
on conflict (periodo_id, centro_origen_id, centro_destino_id) do nothing;

do $$
declare v_suma numeric(9,4);
begin
  select sum(porcentaje) into v_suma
    from public.prorrateo_bases b
    join public.centros_costo c on c.id = b.centro_origen_id
   where c.codigo = 'TAL';
  raise notice 'Bases del Taller (junio 2026) cargadas, suman %. General: PENDIENTE.', v_suma;
end $$;
