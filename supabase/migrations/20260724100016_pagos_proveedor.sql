-- =============================================================================
-- Fase 3 (extensión): pagos a proveedores (aplicados a las CxP).
--
-- Un pago salda una o varias facturas (total o parcial), sale de una cuenta de
-- caja o banco elegida, y guarda el medio (efectivo/transferencia/cheque) y una
-- referencia — todo para poder conciliar después contra el estado de cuenta.
--   Al confirmar: Debe CxP (21-10-01) / Haber la cuenta de caja o banco.
--   Baja el saldo de cada CxP (cxp_aplicaciones tipo 'pago') y la marca 'pagada'
--   cuando llega a 0.
-- =============================================================================

-- Permiso nuevo: pagar compras (tesorería). Al admin y al contador.
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('compras', 'pagar', 'compras.pagar', 'Registrar y anular pagos a proveedores')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo = 'compras.pagar'
 where r.codigo in ('administrador','contador') on conflict do nothing;

-- === TABLAS =================================================================
create table public.pagos_proveedor (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  medio_pago     text not null check (medio_pago in ('efectivo','transferencia','cheque','otro')),
  cuenta_pago_id uuid not null references public.cuentas(id),   -- caja o banco de origen
  referencia     text,                                          -- nº transferencia / cheque
  glosa          text,
  monto_total    numeric(18,2) not null default 0,
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz, confirmado_por uuid,
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.pagos_proveedor_lineas (
  id       uuid primary key default gen_random_uuid(),
  pago_id  uuid not null references public.pagos_proveedor(id) on delete cascade,
  linea    int not null,
  cxp_id   uuid not null references public.cuentas_por_pagar(id),
  monto    numeric(18,2) not null check (monto > 0),
  unique (pago_id, linea)
);
select public.fn_adjuntar_auditoria('public.pagos_proveedor');

create trigger trg_pago_no_delete before delete on public.pagos_proveedor
  for each row execute function public.fn_bloquear_delete();

create or replace function public.fn_pago_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.pago_id else new.pago_id end;
  select estado into v_estado from public.pagos_proveedor where id = v_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'El pago está %: sus líneas son inmutables.', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_pago_lineas_borrador
  before insert or update or delete on public.pagos_proveedor_lineas
  for each row execute function public.fn_pago_lineas_solo_borrador();

-- === ALTA ATÓMICA ===========================================================
create or replace function public.fn_crear_pago(
  p_proveedor uuid,
  p_fecha     date,
  p_medio     text,
  p_cuenta_pago uuid,
  p_referencia text,
  p_glosa     text,
  p_lineas    jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; r jsonb; i int := 0; v_total numeric(18,2) := 0;
  v_saldo numeric(18,2); v_prov uuid; v_monto numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.pagar');
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pago no tiene facturas.'; end if;
  if not exists (select 1 from public.cuentas where id = p_cuenta_pago and acepta_movimiento and estado='activo') then
    raise exception 'La cuenta de pago no es válida.'; end if;

  insert into public.pagos_proveedor (proveedor_id, fecha, medio_pago, cuenta_pago_id, referencia, glosa)
  values (p_proveedor,
          coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date),
          p_medio, p_cuenta_pago,
          nullif(btrim(coalesce(p_referencia,'')),''),
          nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_monto := round((r->>'monto')::numeric, 2);
    select saldo, proveedor_id into v_saldo, v_prov
      from public.cuentas_por_pagar where id = (r->>'cxp_id')::uuid;
    if v_saldo is null then raise exception 'Cuenta por pagar inexistente en la línea %.', i; end if;
    if v_prov <> p_proveedor then raise exception 'La factura de la línea % no es de ese proveedor.', i; end if;
    if v_monto <= 0 then raise exception 'El abono de la línea % debe ser mayor que cero.', i; end if;
    if v_monto > v_saldo then raise exception 'El abono de la línea % (%) supera el saldo (%).', i, v_monto, v_saldo; end if;

    insert into public.pagos_proveedor_lineas (pago_id, linea, cxp_id, monto)
    values (v_id, i, (r->>'cxp_id')::uuid, v_monto);
    v_total := v_total + v_monto;
  end loop;

  update public.pagos_proveedor set monto_total = v_total where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_pago(uuid, date, text, uuid, text, text, jsonb) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_pago(p_pago uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_prov uuid; v_cuenta uuid; v_total numeric(18,2);
  v_cta_cxp uuid; v_lineas jsonb; v_asiento uuid; r record; v_saldo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.pagar');
  select estado, fecha, proveedor_id, cuenta_pago_id, monto_total
    into v_estado, v_fecha, v_prov, v_cuenta, v_total
    from public.pagos_proveedor where id = p_pago;
  if v_estado is null then raise exception 'Pago inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El pago ya está %.', v_estado; end if;
  if not exists (select 1 from public.pagos_proveedor_lineas where pago_id = p_pago) then
    raise exception 'El pago no tiene líneas.'; end if;

  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = v_prov;

  -- Revalida saldos y baja las CxP.
  for r in select * from public.pagos_proveedor_lineas where pago_id = p_pago order by linea loop
    select saldo into v_saldo from public.cuentas_por_pagar where id = r.cxp_id;
    if r.monto > v_saldo then raise exception 'El abono supera el saldo actual de una factura.'; end if;
    insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id, fecha)
    values (r.cxp_id, 'pago', r.monto, 'pago_proveedor', p_pago, v_fecha);
    update public.cuentas_por_pagar
       set saldo = saldo - r.monto,
           estado = case when saldo - r.monto <= 0 then 'pagada' else estado end
     where id = r.cxp_id;
  end loop;

  -- Asiento: Debe CxP / Haber caja o banco.
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp,  'debito',  v_total, 'detalle','Pago a proveedor'),
    jsonb_build_object('cuenta_id', v_cuenta,   'credito', v_total, 'detalle','Salida de caja/banco'));
  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Pago a proveedor', 'pago_proveedor', p_pago, v_lineas);

  update public.pagos_proveedor
     set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_pago;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_pago(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_pago(p_pago uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; r record;
begin
  perform public.fn_exigir_permiso('compras.pagar');
  select estado into v_estado from public.pagos_proveedor where id = p_pago;
  if v_estado is null then raise exception 'Pago inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un pago confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Restaura el saldo de cada CxP.
  for r in select * from public.pagos_proveedor_lineas where pago_id = p_pago loop
    insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id)
    values (r.cxp_id, 'ajuste', r.monto, 'pago_anulacion', p_pago);
    update public.cuentas_por_pagar set saldo = saldo + r.monto, estado='pendiente' where id = r.cxp_id;
  end loop;

  perform public.fn_anular_asiento_auto('pago_proveedor', p_pago, p_motivo);

  update public.pagos_proveedor set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_pago;
end $$;
grant execute on function public.fn_anular_pago(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.pagos_proveedor        enable row level security;
alter table public.pagos_proveedor_lineas enable row level security;
create policy pago_sel on public.pagos_proveedor for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.pagar'));
create policy pago_wr on public.pagos_proveedor for all to authenticated
  using (public.tengo_permiso('compras.pagar')) with check (public.tengo_permiso('compras.pagar'));
create policy pagol_all on public.pagos_proveedor_lineas for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.pagar'))
  with check (public.tengo_permiso('compras.pagar'));

do $$
begin
  raise notice 'Pagos a proveedores listos: fn_crear_pago / fn_confirmar_pago / fn_anular_pago.';
end $$;
