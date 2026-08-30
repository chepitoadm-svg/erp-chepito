-- =============================================================================
-- Pagos de planilla PARCIALES y desde varias cuentas (banco o caja). Cada pago
-- es su propio asiento (Debe 21-10-11 Salarios por pagar / Haber la cuenta). El
-- saldo pendiente = neto de la planilla − pagos confirmados.
-- =============================================================================

create table public.planilla_pagos (
  id           uuid primary key default gen_random_uuid(),
  planilla_id  uuid not null references public.planilla(id) on delete cascade,
  fecha        date not null,
  cuenta_id    uuid not null references public.cuentas(id),
  monto        numeric(18,2) not null check (monto > 0),
  asiento_id   uuid references public.asientos(id),
  estado       text not null default 'confirmado' check (estado in ('confirmado','anulado')),
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  anulado_en   timestamptz, anulado_por uuid
);
create index planilla_pagos_pl on public.planilla_pagos (planilla_id);
select public.fn_adjuntar_auditoria('public.planilla_pagos');

-- Neto total de una planilla.
create or replace function public.fn_planilla_neto(p_planilla uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario_base + pago_adicional - ccss_obrero - adelanto), 2), 0)
    from public.planilla_lineas where planilla_id = p_planilla;
$$;
grant execute on function public.fn_planilla_neto(uuid) to authenticated;

-- La firma vieja de pago (sin monto) ya no aplica.
drop function if exists public.fn_pagar_planilla(uuid, uuid, date);

-- Registra un pago parcial (o total) desde una cuenta.
create or replace function public.fn_pagar_planilla(p_planilla uuid, p_cuenta uuid, p_fecha date, p_monto numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_estado text; v_tit text; v_neto numeric; v_pagado numeric; v_saldo numeric;
        v_c_neto uuid; v_pago uuid; v_asiento uuid; v_lineas jsonb;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  select estado, titulo into v_estado, v_tit from public.planilla where id = p_planilla;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Primero posteá la provisión de la planilla.'; end if;
  if p_cuenta is null then raise exception 'Elegí la cuenta de banco o caja.'; end if;
  if p_fecha is null then raise exception 'Poné la fecha del pago.'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;

  v_neto := public.fn_planilla_neto(p_planilla);
  select coalesce(round(sum(monto),2),0) into v_pagado
    from public.planilla_pagos where planilla_id = p_planilla and estado = 'confirmado';
  v_saldo := round(v_neto - v_pagado, 2);
  if p_monto > v_saldo + 0.005 then
    raise exception 'El monto (%) supera el saldo pendiente (%).', p_monto, v_saldo; end if;

  insert into public.planilla_pagos (planilla_id, fecha, cuenta_id, monto)
    values (p_planilla, p_fecha, p_cuenta, round(p_monto,2)) returning id into v_pago;

  select id into v_c_neto from public.cuentas where codigo = '21-10-11-00-00';
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_c_neto, 'debito',  round(p_monto,2), 'detalle','Pago de planilla'),
    jsonb_build_object('cuenta_id', p_cuenta, 'credito', round(p_monto,2), 'detalle','Pago de planilla')
  );
  v_asiento := public.fn_postear_asiento('egreso', p_fecha, coalesce('Pago planilla '||v_tit,'Pago de planilla'),
                 'planilla_pago', v_pago, v_lineas);
  update public.planilla_pagos set asiento_id = v_asiento where id = v_pago;
  return v_asiento;
end $$;
grant execute on function public.fn_pagar_planilla(uuid, uuid, date, numeric) to authenticated;

-- Anula un pago puntual (por reversión).
create or replace function public.fn_anular_pago_planilla(p_pago uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  select estado into v_estado from public.planilla_pagos where id = p_pago;
  if v_estado is null then raise exception 'Pago inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'El pago ya está %.', v_estado; end if;
  perform public.fn_anular_asiento_auto('planilla_pago', p_pago, p_motivo);
  update public.planilla_pagos set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_pago;
end $$;
grant execute on function public.fn_anular_pago_planilla(uuid, text) to authenticated;

-- Anular la planilla completa: revierte todos los pagos confirmados y la provisión.
create or replace function public.fn_anular_planilla(p_planilla uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; r record;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  select estado into v_estado from public.planilla where id = p_planilla;
  if v_estado is null then raise exception 'Planilla inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'La planilla está %.', v_estado; end if;
  for r in select id from public.planilla_pagos where planilla_id = p_planilla and estado = 'confirmado' loop
    perform public.fn_anular_asiento_auto('planilla_pago', r.id, p_motivo);
    update public.planilla_pagos set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = r.id;
  end loop;
  perform public.fn_anular_asiento_auto('planilla', p_planilla, p_motivo);
  update public.planilla set estado='anulada', anulado_en=now(), anulado_por=auth.uid() where id = p_planilla;
end $$;
grant execute on function public.fn_anular_planilla(uuid, text) to authenticated;

alter table public.planilla_pagos enable row level security;
create policy pp_sel on public.planilla_pagos for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy pp_wr on public.planilla_pagos for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

do $$ begin raise notice 'pagos parciales de planilla listos.'; end $$;
