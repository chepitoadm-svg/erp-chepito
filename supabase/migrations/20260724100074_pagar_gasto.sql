-- =============================================================================
-- Pago de un gasto "por pagar" directo desde la pantalla de Gastos. El gasto
-- creó una cuenta por pagar (saldo en su cuenta pasiva); pagar la cancela contra
-- banco/caja:  Debe (cuenta por pagar del gasto)  /  Haber (banco o caja).
-- Admite pagos parciales; el saldo de la CxP baja y pasa a 'pagada' al llegar a 0.
-- (Los pagos a proveedores siguen por su módulo; esto es para gastos sin proveedor.)
-- =============================================================================

create table public.gasto_pago (
  id          uuid primary key default gen_random_uuid(),
  gasto_id    uuid not null references public.gastos(id),
  cxp_id      uuid references public.cuentas_por_pagar(id),
  fecha       date not null,
  cuenta_id   uuid not null references public.cuentas(id),
  monto       numeric(18,2) not null check (monto > 0),
  asiento_id  uuid references public.asientos(id),
  estado      text not null default 'confirmado' check (estado in ('confirmado','anulado')),
  creado_en   timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  anulado_en  timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create index gasto_pago_gasto on public.gasto_pago (gasto_id);
select public.fn_adjuntar_auditoria('public.gasto_pago');

create or replace function public.fn_pagar_gasto(p_gasto uuid, p_cuenta uuid, p_fecha date, p_monto numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_gestado text; v_cta_pasivo uuid; v_cxp uuid; v_saldo numeric; v_pago uuid; v_asiento uuid;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  select estado, cuenta_pago_id into v_gestado, v_cta_pasivo from public.gastos where id = p_gasto;
  if v_gestado is null then raise exception 'Gasto inexistente.'; end if;
  if v_gestado <> 'confirmado' then raise exception 'El gasto no está confirmado.'; end if;
  if p_cuenta is null then raise exception 'Elegí la cuenta de banco o caja.'; end if;
  if p_fecha is null then raise exception 'Poné la fecha del pago.'; end if;
  if coalesce(p_monto,0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta and acepta_movimiento and estado='activo') then
    raise exception 'Cuenta de pago inválida.'; end if;

  select id, saldo into v_cxp, v_saldo from public.cuentas_por_pagar
    where gasto_id = p_gasto and estado <> 'anulada' order by creado_en desc limit 1;
  if v_cxp is null then raise exception 'Este gasto no tiene saldo por pagar (se pagó de una).'; end if;
  if p_monto > v_saldo + 0.005 then
    raise exception 'El monto (%) supera el saldo pendiente (%).', p_monto, v_saldo; end if;

  insert into public.gasto_pago (gasto_id, cxp_id, fecha, cuenta_id, monto)
    values (p_gasto, v_cxp, p_fecha, p_cuenta, round(p_monto,2)) returning id into v_pago;

  v_asiento := public.fn_postear_asiento('egreso', p_fecha, 'Pago de gasto', 'gasto_pago', v_pago,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_pasivo, 'debito',  round(p_monto,2), 'detalle','Pago de gasto'),
      jsonb_build_object('cuenta_id', p_cuenta,      'credito', round(p_monto,2), 'detalle','Pago de gasto')
    ));
  update public.gasto_pago set asiento_id = v_asiento where id = v_pago;

  update public.cuentas_por_pagar
     set saldo = round(saldo - round(p_monto,2), 2),
         estado = case when round(saldo - round(p_monto,2),2) <= 0.005 then 'pagada' else estado end
   where id = v_cxp;
  return v_asiento;
end $$;
grant execute on function public.fn_pagar_gasto(uuid, uuid, date, numeric) to authenticated;

create or replace function public.fn_anular_pago_gasto(p_pago uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_cxp uuid; v_monto numeric;
begin
  if not public.tengo_permiso('gastos.registrar') then raise exception 'No tenés permiso.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  select estado, cxp_id, monto into v_estado, v_cxp, v_monto from public.gasto_pago where id = p_pago;
  if v_estado is null then raise exception 'Pago inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'El pago ya está %.', v_estado; end if;
  perform public.fn_anular_asiento_auto('gasto_pago', p_pago, p_motivo);
  update public.gasto_pago set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_pago;
  if v_cxp is not null then
    update public.cuentas_por_pagar set saldo = round(saldo + v_monto, 2), estado = 'pendiente' where id = v_cxp;
  end if;
end $$;
grant execute on function public.fn_anular_pago_gasto(uuid, text) to authenticated;

alter table public.gasto_pago enable row level security;
create policy gp_sel on public.gasto_pago for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy gp_wr on public.gasto_pago for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

do $$ begin raise notice 'pagar gasto listo.'; end $$;
