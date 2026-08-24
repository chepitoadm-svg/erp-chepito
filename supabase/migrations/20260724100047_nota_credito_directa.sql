-- =============================================================================
-- Nota de crédito de compra DIRECTA: se crea como una "factura en negativo"
-- (sin devolver mercadería). Baja lo que se le debe al proveedor (crédito
-- general) y se aplica junto con las facturas al pagar.
--   Debe Cuentas por Pagar (total) / Haber cuenta elegida (base, con centro)
--                                   + Haber IVA acreditable (reversa)
-- Crea una línea de crédito en cuentas_por_pagar (saldo NEGATIVO), igual que la
-- de la devolución, y se netea en el pago.
-- =============================================================================

alter table public.cuentas_por_pagar
  add column if not exists nota_credito_id uuid;

create table if not exists public.notas_credito_compra (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references public.proveedores(id),
  fecha           date not null default (now() at time zone 'America/Costa_Rica')::date,
  cuenta_id       uuid not null references public.cuentas(id),   -- contrapartida (Haber): descuento/gasto
  centro_costo_id uuid references public.centros_costo(id),
  referencia      text,                                          -- N.º de la nota de crédito
  subtotal        numeric(18,2) not null check (subtotal > 0),
  iva             numeric(18,2) not null default 0,
  total           numeric(18,2) not null,
  glosa           text,
  estado          text not null default 'confirmada' check (estado in ('confirmada','anulada')),
  asiento_id      uuid references public.asientos(id),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  anulada_en      timestamptz, anulada_por uuid,
  actualizado_en  timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.notas_credito_compra');
create trigger trg_ncc_no_delete before delete on public.notas_credito_compra
  for each row execute function public.fn_bloquear_delete();

alter table public.cuentas_por_pagar
  add constraint cxp_nota_credito_fk foreign key (nota_credito_id) references public.notas_credito_compra(id);

-- === ALTA (crea, postea y genera el crédito, en una transacción) ============
create or replace function public.fn_crear_nota_credito(
  p_proveedor uuid, p_fecha date, p_cuenta uuid, p_centro uuid,
  p_subtotal numeric, p_iva numeric, p_referencia text, p_glosa text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_fecha date; v_total numeric(18,2); v_cta_cxp uuid; v_cta_iva uuid;
  v_asiento uuid; v_lineas jsonb; v_ctipo text;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  if p_proveedor is null then raise exception 'Elegí el proveedor.'; end if;
  if coalesce(p_subtotal,0) <= 0 then raise exception 'El monto de la nota de crédito debe ser mayor que cero.'; end if;
  if p_cuenta is null then raise exception 'Elegí la cuenta de la nota de crédito.'; end if;
  select tipo into v_ctipo from public.cuentas where id = p_cuenta and acepta_movimiento and estado='activo';
  if v_ctipo is null then raise exception 'La cuenta de la nota de crédito no es válida.'; end if;
  -- Las cuentas de resultado exigen centro (regla del asiento).
  if v_ctipo in ('ingreso','gasto') and p_centro is null then
    raise exception 'La cuenta elegida es de resultado y exige un centro de costo.'; end if;

  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);
  v_total := round(coalesce(p_subtotal,0) + coalesce(p_iva,0), 2);
  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = p_proveedor;
  select id into v_cta_iva from public.cuentas where codigo='21-10-15-01-00';

  insert into public.notas_credito_compra
    (proveedor_id, fecha, cuenta_id, centro_costo_id, referencia, subtotal, iva, total, glosa)
  values (p_proveedor, v_fecha, p_cuenta, p_centro, nullif(btrim(coalesce(p_referencia,'')),''),
          round(p_subtotal,2), round(coalesce(p_iva,0),2), v_total, nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;

  -- Asiento: Debe CxP (total) / Haber cuenta (base) + Haber IVA (reversa).
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp, 'debito', v_total, 'detalle','Nota de crédito de proveedor'),
    jsonb_build_object('cuenta_id', p_cuenta, 'credito', round(p_subtotal,2),
                       'centro_costo_id', case when v_ctipo in ('ingreso','gasto') then p_centro end,
                       'detalle', coalesce(nullif(btrim(coalesce(p_glosa,'')),''),'Nota de crédito')));
  if coalesce(p_iva,0) > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'credito', round(p_iva,2), 'detalle','Reversa de IVA crédito');
  end if;
  v_asiento := public.fn_postear_asiento('ingreso', v_fecha, 'Nota de crédito de proveedor', 'nota_credito_compra', v_id, v_lineas);

  update public.notas_credito_compra set estado='confirmada', asiento_id=v_asiento where id = v_id;

  -- Crédito general del proveedor (saldo negativo, sin factura).
  insert into public.cuentas_por_pagar
    (proveedor_id, factura_id, tipo, nota_credito_id, fecha, fecha_vencimiento, monto_original, saldo, estado)
  values (p_proveedor, null, 'credito', v_id, v_fecha, null, -v_total, -v_total, 'pendiente');

  return v_id;
end $$;
grant execute on function public.fn_crear_nota_credito(uuid, date, uuid, uuid, numeric, numeric, text, text) to authenticated;

-- === ANULAR (si el crédito no se aplicó a un pago) ==========================
create or replace function public.fn_anular_nota_credito(p_nc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_cxp uuid; v_saldo numeric(18,2); v_mo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado into v_estado from public.notas_credito_compra where id = p_nc;
  if v_estado is null then raise exception 'Nota de crédito inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una nota de crédito confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  select id, saldo, monto_original into v_cxp, v_saldo, v_mo
    from public.cuentas_por_pagar where nota_credito_id = p_nc and tipo='credito';
  if v_cxp is not null and round(v_saldo,2) <> round(v_mo,2) then
    raise exception 'El crédito de esta nota ya se aplicó a un pago. Anulá el pago primero.';
  end if;

  perform public.fn_anular_asiento_auto('nota_credito_compra', p_nc, p_motivo);
  if v_cxp is not null then
    update public.cuentas_por_pagar set estado='anulada', saldo=0 where id = v_cxp;
  end if;
  update public.notas_credito_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_nc;
end $$;
grant execute on function public.fn_anular_nota_credito(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.notas_credito_compra enable row level security;
create policy ncc_sel on public.notas_credito_compra for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy ncc_wr on public.notas_credito_compra for all to authenticated
  using (public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));

do $$ begin raise notice 'Notas de crédito directas listas.'; end $$;
