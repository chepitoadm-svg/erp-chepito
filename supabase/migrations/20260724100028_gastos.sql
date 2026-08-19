-- =============================================================================
-- Gastos (vía rápida, aparte de la factura de gasto de Compras).
-- Para meter cualquier gasto del mes con su centro de costo, pagado de
-- caja/banco o dejado por pagar. Alimenta el Estado de Resultados por canal.
-- Al confirmar postea:
--   Debe  <cuenta de gasto>   (centro)     subtotal
--   Debe  21-10-15-01 IVA crédito           iva      (si hay)
--   Haber <cuenta de pago>                  total    (caja/banco o por pagar)
-- La factura de gasto de Compras sigue siendo para facturas electrónicas de
-- proveedor con CxP formal; esto es para todo lo demás (planilla, servicios
-- pagados, caja chica, etc.).
-- =============================================================================

insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('gastos', 'registrar', 'gastos.registrar', 'Registrar y anular gastos')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo = 'gastos.registrar'
 where r.codigo in ('administrador','contador') on conflict do nothing;

create table public.gastos (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  centro_costo_id uuid not null references public.centros_costo(id),
  cuenta_gasto_id uuid not null references public.cuentas(id),
  cuenta_pago_id  uuid not null references public.cuentas(id),
  descripcion     text,
  subtotal        numeric(18,2) not null check (subtotal > 0),
  iva             numeric(18,2) not null default 0 check (iva >= 0),
  total           numeric(18,2) not null,
  estado          text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  asiento_id      uuid references public.asientos(id),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  confirmado_en   timestamptz, confirmado_por uuid,
  anulado_en      timestamptz, anulado_por uuid,
  actualizado_en  timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.gastos');
create trigger trg_gasto_no_delete before delete on public.gastos
  for each row execute function public.fn_bloquear_delete();

-- === ALTA ===================================================================
create or replace function public.fn_crear_gasto(
  p_centro uuid, p_fecha date, p_cuenta_gasto uuid, p_cuenta_pago uuid,
  p_subtotal numeric, p_iva numeric, p_descripcion text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sub numeric(18,2); v_iva numeric(18,2);
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo) then
    raise exception 'Elegí un centro de costo válido.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_gasto and acepta_movimiento
                   and estado='activo' and tipo in ('gasto','ingreso')) then
    raise exception 'La cuenta de gasto no es válida (debe ser de resultado y aceptar movimiento).'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_pago and acepta_movimiento
                   and estado='activo' and tipo in ('activo','pasivo')) then
    raise exception 'La cuenta de pago no es válida (caja/banco o cuenta por pagar).'; end if;

  v_sub := round(coalesce(p_subtotal,0),2);
  v_iva := round(coalesce(p_iva,0),2);
  if v_sub <= 0 then raise exception 'El monto del gasto debe ser mayor que cero.'; end if;

  insert into public.gastos (fecha, centro_costo_id, cuenta_gasto_id, cuenta_pago_id,
                             descripcion, subtotal, iva, total)
  values (coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date), p_centro,
          p_cuenta_gasto, p_cuenta_pago, nullif(btrim(coalesce(p_descripcion,'')),''),
          v_sub, v_iva, v_sub + v_iva)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_gasto(uuid, date, uuid, uuid, numeric, numeric, text) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_gasto(p_gasto uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_centro uuid; v_cta_gasto uuid; v_cta_pago uuid;
  v_sub numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2);
  v_cta_iva uuid; v_lineas jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  select estado, fecha, centro_costo_id, cuenta_gasto_id, cuenta_pago_id, subtotal, iva, total
    into v_estado, v_fecha, v_centro, v_cta_gasto, v_cta_pago, v_sub, v_iva, v_tot
    from public.gastos where id = p_gasto;
  if v_estado is null then raise exception 'Gasto inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El gasto ya está %.', v_estado; end if;

  select id into v_cta_iva from public.cuentas where codigo = '21-10-15-01-00';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_gasto, 'debito', v_sub, 'centro_costo_id', v_centro, 'detalle','Gasto'));
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'); end if;
  v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_pago, 'credito', v_tot, 'detalle','Pago del gasto');

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Gasto', 'gasto', p_gasto, v_lineas);

  update public.gastos set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_gasto;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_gasto(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_gasto(p_gasto uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('gastos.registrar');
  select estado into v_estado from public.gastos where id = p_gasto;
  if v_estado is null then raise exception 'Gasto inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un gasto confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  perform public.fn_anular_asiento_auto('gasto', p_gasto, p_motivo);
  update public.gastos set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_gasto;
end $$;
grant execute on function public.fn_anular_gasto(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.gastos enable row level security;
create policy gastos_sel on public.gastos for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('gastos.registrar'));
create policy gastos_wr on public.gastos for all to authenticated
  using (public.tengo_permiso('gastos.registrar')) with check (public.tengo_permiso('gastos.registrar'));

do $$ begin raise notice 'gastos listo.'; end $$;
