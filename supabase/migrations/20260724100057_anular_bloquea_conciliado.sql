-- =============================================================================
-- Candado: no se puede ANULAR (ni editar, que anula+reposte) un asiento que está
-- CONCILIADO con el banco. Antes había que desconciliar a mano; si no, al anular
-- el gasto/pago la línea del banco quedaba "conciliada" apuntando a un asiento
-- anulado (conciliación colgada). Ahora se exige desconciliar primero.
-- Se recrea fn_anular_asiento agregando la validación; cubre el camino manual y
-- el automático (fn_anular_asiento_auto la usa por dentro).
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
  v_periodo    uuid;
  v_per_estado text;
  v_fecha_rev  date;
  v_rev_id     uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'La anulación exige un motivo.';
  end if;

  select estado, tipo, fecha, periodo_id
    into v_estado, v_tipo, v_fecha, v_periodo
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

  -- CANDADO: no anular un movimiento conciliado con el banco.
  if exists (
    select 1 from public.estado_cuenta_lineas e
    join public.asientos_lineas al on al.id = e.asiento_linea_id
    where al.asiento_id = p_asiento_id
  ) then
    raise exception 'Este movimiento está conciliado con el banco. Desconciliá primero el pago en Tesorería → Conciliaciones, y volvé a intentar.';
  end if;

  select estado into v_per_estado from public.periodos_contables where id = v_periodo;

  if v_per_estado = 'abierto' then
    v_fecha_rev := v_fecha;
  else
    select fecha_inicio into v_fecha_rev
      from public.periodos_contables
     where estado = 'abierto'
       and fecha_fin >= v_fecha
     order by anio, mes
     limit 1;

    if v_fecha_rev is null then
      raise exception
        'No hay ningún periodo abierto en o después del % donde registrar la reversión. '
        'Reabrí un periodo o generá el siguiente.', v_fecha;
    end if;
  end if;

  insert into public.asientos (tipo, fecha, glosa)
  values ('reversion', v_fecha_rev,
          'ANULACIÓN de asiento ' || p_asiento_id::text || ' — ' || btrim(p_motivo))
  returning id into v_rev_id;

  insert into public.asientos_lineas
    (asiento_id, linea, cuenta_id, centro_costo_id,
     debito, credito, moneda, tipo_cambio, monto_original, detalle)
  select v_rev_id, l.linea, l.cuenta_id, l.centro_costo_id,
         l.credito, l.debito, l.moneda, l.tipo_cambio, l.monto_original,
         'Reversión: ' || coalesce(l.detalle, '')
    from public.asientos_lineas l
   where l.asiento_id = p_asiento_id
   order by l.linea;

  update public.asientos set estado = 'confirmado' where id = v_rev_id;
  update public.asientos set estado = 'anulado'    where id = p_asiento_id;

  insert into public.asientos_anulaciones
    (asiento_id, asiento_reversion_id, motivo, fecha_original, fecha_reversion)
  values (p_asiento_id, v_rev_id, btrim(p_motivo), v_fecha, v_fecha_rev);

  return v_rev_id;
end;
$$;

do $$ begin raise notice 'fn_anular_asiento ahora bloquea anular movimientos conciliados.'; end $$;
