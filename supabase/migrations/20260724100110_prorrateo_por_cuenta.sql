-- =============================================================================
-- Prorrateo POR CUENTA para los centros intermedios (ej. General): cada cuenta
-- puede tener su propio % de reparto por mes, en vez de un único % para todo el
-- centro. Taller sigue igual (usa las bases a nivel de centro, cuenta_id NULL).
--
-- - prorrateo_bases.cuenta_id NULL = base del CENTRO (comportamiento actual).
-- - prorrateo_bases.cuenta_id con valor = base ESPECÍFICA de esa cuenta.
-- - Al generar: si un centro tiene alguna base por cuenta, entra en "modo por
--   cuenta" y CADA cuenta con saldo debe tener su base; si falta, AVISA (no
--   reparte). Si el centro no tiene bases por cuenta, usa la del centro (Taller).
-- =============================================================================

alter table public.prorrateo_bases
  add column if not exists cuenta_id uuid references public.cuentas(id);

-- Reemplazar la unicidad (antes por centro) por dos: una para las del centro
-- (cuenta NULL) y otra para las específicas por cuenta.
do $$ declare v text; begin
  select conname into v from pg_constraint
   where conrelid = 'public.prorrateo_bases'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(periodo_id, centro_origen_id, centro_destino_id)%';
  if v is not null then execute 'alter table public.prorrateo_bases drop constraint ' || quote_ident(v); end if;
end $$;
create unique index if not exists prorrateo_bases_centro_uq
  on public.prorrateo_bases (periodo_id, centro_origen_id, centro_destino_id) where cuenta_id is null;
create unique index if not exists prorrateo_bases_cuenta_uq
  on public.prorrateo_bases (periodo_id, centro_origen_id, cuenta_id, centro_destino_id) where cuenta_id is not null;

-- La suma 100 se valida por GRUPO: (periodo, origen, cuenta). Cada juego de % —el
-- del centro o el de una cuenta— suma 100 (o 0 = no se reparte).
create or replace function public.fn_validar_suma_bases(p_periodo uuid, p_origen uuid, p_cuenta uuid default null)
returns void language plpgsql as $$
declare v_suma numeric(9,4);
begin
  select coalesce(sum(porcentaje), 0) into v_suma
    from public.prorrateo_bases
   where periodo_id = p_periodo and centro_origen_id = p_origen
     and cuenta_id is not distinct from p_cuenta;
  if v_suma = 0 then return; end if;
  if v_suma <> 100 then
    raise exception 'Las bases de % (%) en ese periodo suman %, deben sumar exactamente 100.',
      (select codigo from public.centros_costo where id = p_origen),
      coalesce((select codigo from public.cuentas where id = p_cuenta), 'centro'),
      v_suma;
  end if;
end;
$$;

create or replace function public.fn_trg_suma_bases()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_validar_suma_bases(old.periodo_id, old.centro_origen_id, old.cuenta_id);
  else
    perform public.fn_validar_suma_bases(new.periodo_id, new.centro_origen_id, new.cuenta_id);
    if tg_op = 'UPDATE' and (old.periodo_id, old.centro_origen_id, old.cuenta_id)
       is distinct from (new.periodo_id, new.centro_origen_id, new.cuenta_id) then
      perform public.fn_validar_suma_bases(old.periodo_id, old.centro_origen_id, old.cuenta_id);
    end if;
  end if;
  return null;
end;
$$;

-- === Generador: respeta el % por cuenta y AVISA si falta configurar ==========
create or replace function public.fn_generar_prorrateo(p_periodo_id uuid, p_centro_origen_id uuid)
returns uuid language plpgsql as $$
declare
  v_tipo_o text; v_cod_o text; v_fecha date; v_asiento uuid; v_linea int := 0;
  v_modo_cuenta boolean; v_faltan text; r_cuenta record; r_dest record;
  v_cuenta_base uuid; v_n_destinos int; v_pool numeric(18,2); v_acum numeric(18,2);
  v_monto numeric(18,2); v_i int;
begin
  select tipo, codigo into v_tipo_o, v_cod_o from public.centros_costo where id = p_centro_origen_id;
  if v_tipo_o is null then raise exception 'Centro de costo % inexistente.', p_centro_origen_id; end if;
  if v_tipo_o <> 'intermedio' then raise exception 'Solo se prorratea un centro INTERMEDIO (% es %).', v_cod_o, v_tipo_o; end if;

  perform public.fn_exigir_periodo_abierto(p_periodo_id);
  select fecha_fin into v_fecha from public.periodos_contables where id = p_periodo_id;

  -- ¿El centro tiene bases POR CUENTA este periodo? entonces "modo por cuenta".
  v_modo_cuenta := exists (
    select 1 from public.prorrateo_bases
     where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id and cuenta_id is not null);

  -- Pre-chequeo: cuentas con saldo que NO tienen base aplicable → avisar.
  select string_agg(cu.codigo || ' ' || cu.nombre, ', ' order by cu.codigo) into v_faltan
    from (
      select l.cuenta_id, sum(l.debito) - sum(l.credito) saldo
        from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
       where a.estado = 'confirmado' and a.periodo_id = p_periodo_id and l.centro_costo_id = p_centro_origen_id
       group by l.cuenta_id having sum(l.debito) - sum(l.credito) <> 0
    ) s join public.cuentas cu on cu.id = s.cuenta_id
   where not exists (
      select 1 from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id and b.centro_origen_id = p_centro_origen_id
         and (b.cuenta_id = s.cuenta_id or (not v_modo_cuenta and b.cuenta_id is null)));
  if v_faltan is not null then
    raise exception 'Faltan bases de prorrateo para: %. Configuralas en Configuración → Prorrateo.', v_faltan;
  end if;

  insert into public.asientos (tipo, fecha, glosa)
  values ('prorrateo', v_fecha, 'Prorrateo de ' || v_cod_o || ' del periodo') returning id into v_asiento;

  for r_cuenta in
    select l.cuenta_id, sum(l.debito) - sum(l.credito) as saldo
      from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado' and a.periodo_id = p_periodo_id and l.centro_costo_id = p_centro_origen_id
     group by l.cuenta_id having sum(l.debito) - sum(l.credito) <> 0
     order by l.cuenta_id
  loop
    -- Base a usar: la específica de la cuenta si existe; si no, la del centro.
    if exists (select 1 from public.prorrateo_bases where periodo_id = p_periodo_id
                 and centro_origen_id = p_centro_origen_id and cuenta_id = r_cuenta.cuenta_id) then
      v_cuenta_base := r_cuenta.cuenta_id;
    else
      v_cuenta_base := null;
    end if;
    select count(*) into v_n_destinos from public.prorrateo_bases
      where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id
        and cuenta_id is not distinct from v_cuenta_base;

    v_pool := r_cuenta.saldo; v_acum := 0; v_i := 0;
    for r_dest in
      select b.centro_destino_id, b.porcentaje from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id and b.centro_origen_id = p_centro_origen_id
         and b.cuenta_id is not distinct from v_cuenta_base
       order by b.orden, b.centro_destino_id
    loop
      v_i := v_i + 1;
      if v_i < v_n_destinos then
        v_monto := round(v_pool * r_dest.porcentaje / 100, 2); v_acum := v_acum + v_monto;
      else
        v_monto := v_pool - v_acum;   -- la última absorbe el residuo
      end if;
      if v_monto <> 0 then
        v_linea := v_linea + 1;
        insert into public.asientos_lineas (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
        values (v_asiento, v_linea, r_cuenta.cuenta_id, r_dest.centro_destino_id,
                case when v_monto > 0 then v_monto else 0 end, case when v_monto < 0 then -v_monto else 0 end,
                abs(v_monto), 'Prorrateo desde ' || v_cod_o);
      end if;
    end loop;

    -- Contrapartida: vacía la cuenta en el centro intermedio.
    v_linea := v_linea + 1;
    insert into public.asientos_lineas (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (v_asiento, v_linea, r_cuenta.cuenta_id, p_centro_origen_id,
            case when v_pool < 0 then -v_pool else 0 end, case when v_pool > 0 then v_pool else 0 end,
            abs(v_pool), 'Vaciado de ' || v_cod_o);
  end loop;

  if v_linea = 0 then raise exception 'El centro % no tiene saldo que prorratear en ese periodo.', v_cod_o; end if;
  return v_asiento;
end;
$$;

do $$ begin raise notice 'Prorrateo por cuenta listo (bases con cuenta_id, avisa si falta).'; end $$;
