-- =============================================================================
-- Fase 3 — Migración 5b: factura de compra + Cuentas por Pagar.
--
-- Dos caminos:
--  A) Factura SOLA (trae la mercadería, caso 1 paso): ingresa inventario.
--       Debe Inventario + Debe IVA crédito / Haber CxP
--  B) Factura que SALDA una recepción previa: el inventario ya entró.
--       Debe puente (21-10-25) + Debe IVA + Debe/Haber Inv (diferencia de precio)
--       / Haber CxP
-- El IVA que suma es solo el código 07 (Decisión: otros impuestos son informativos).
-- =============================================================================

create table public.facturas_compra (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  recepcion_id   uuid references public.recepciones(id),   -- null = trae la mercadería
  bodega_id      uuid references public.bodegas(id),         -- usado si no hay recepción
  clave          text unique,                                -- 50 dígitos del XML (idempotencia real)
  consecutivo    text,
  fecha_emision  date not null default (now() at time zone 'America/Costa_Rica')::date,
  condicion_venta text,
  plazo_credito  int,
  fecha_vencimiento date,
  moneda         text not null default 'CRC',
  tipo_cambio    numeric(18,6) not null default 1,
  subtotal       numeric(18,2) not null default 0,   -- base gravable (mercadería)
  iva_total      numeric(18,2) not null default 0,   -- solo código 07
  total          numeric(18,2) not null default 0,   -- subtotal + iva
  estado         text not null default 'borrador' check (estado in ('borrador','confirmada','anulada')),
  asiento_id     uuid references public.asientos(id),
  xml_adjunto    text,                                 -- el XML crudo, para auditoría
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmada_en  timestamptz, confirmada_por uuid,
  anulada_en     timestamptz, anulada_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.facturas_compra_lineas (
  id             uuid primary key default gen_random_uuid(),
  factura_id     uuid not null references public.facturas_compra(id) on delete cascade,
  linea          int not null,
  codigo_comercial text,
  articulo_id    uuid not null references public.articulos(id),
  cantidad       numeric(18,4) not null check (cantidad > 0),   -- en unidad de stock
  costo_unitario numeric(18,4) not null check (costo_unitario >= 0),
  base_imponible numeric(18,2) not null,                         -- cantidad * costo
  iva_tarifa_id  uuid references public.iva_tarifas(id),
  iva_monto      numeric(18,2) not null default 0,               -- código 07
  detalle        text,
  unique (factura_id, linea)
);
-- Otros impuestos de la línea (código 05 específico asumido fábrica, etc.):
-- informativos, NO suman al total que se paga.
create table public.facturas_compra_otros_impuestos (
  id              uuid primary key default gen_random_uuid(),
  factura_linea_id uuid not null references public.facturas_compra_lineas(id) on delete cascade,
  codigo          text not null,          -- código de impuesto de Hacienda
  tarifa          numeric(7,4),
  monto           numeric(18,2) not null default 0,
  suma_al_total   boolean not null default false
);
select public.fn_adjuntar_auditoria('public.facturas_compra');

create trigger trg_fact_no_delete before delete on public.facturas_compra
  for each row execute function public.fn_bloquear_delete();

create or replace function public.fn_fact_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.factura_id else new.factura_id end;
  select estado into v_estado from public.facturas_compra where id = v_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'La factura está %: sus líneas son inmutables.', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_fact_lineas_borrador
  before insert or update or delete on public.facturas_compra_lineas
  for each row execute function public.fn_fact_lineas_solo_borrador();

-- =============================================================================
-- CUENTAS POR PAGAR
-- =============================================================================
create table public.cuentas_por_pagar (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  factura_id     uuid unique references public.facturas_compra(id),
  fecha          date not null,
  fecha_vencimiento date,
  monto_original numeric(18,2) not null,
  saldo          numeric(18,2) not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente','pagada','anulada')),
  creado_en      timestamptz not null default now()
);
create table public.cxp_aplicaciones (
  id           uuid primary key default gen_random_uuid(),
  cxp_id       uuid not null references public.cuentas_por_pagar(id),
  tipo         text not null check (tipo in ('pago','devolucion','ajuste')),
  monto        numeric(18,2) not null check (monto > 0),
  origen_tipo  text, origen_id uuid,
  fecha        date not null default (now() at time zone 'America/Costa_Rica')::date,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid()
);

-- =============================================================================
-- CONFIRMAR FACTURA
-- =============================================================================
create or replace function public.fn_confirmar_factura(p_factura uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_recep uuid; v_bodega uuid; v_prov uuid;
  v_sub numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2); v_venc date;
  v_cta_inv uuid; v_cta_iva uuid; v_cta_cxp uuid; v_cta_puente uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
  v_puente_val numeric(18,2); v_diff numeric(18,2); r record;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, fecha_emision, recepcion_id, bodega_id, proveedor_id, subtotal, iva_total, total, fecha_vencimiento
    into v_estado, v_fecha, v_recep, v_bodega, v_prov, v_sub, v_iva, v_tot, v_venc
    from public.facturas_compra where id = p_factura;
  if v_estado is null then raise exception 'Factura inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La factura ya está %.', v_estado; end if;
  if not exists (select 1 from public.facturas_compra_lineas where factura_id = p_factura) then
    raise exception 'La factura no tiene líneas.'; end if;

  select id into v_cta_inv    from public.cuentas where codigo='11-60-01-00-00';
  select id into v_cta_iva    from public.cuentas where codigo='21-10-15-01-00';
  select id into v_cta_puente from public.cuentas where codigo='21-10-25-00-00';
  select coalesce(cuenta_cxp_id, (select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id = v_prov;

  if v_recep is null then
    -- CASO A: la factura trae la mercadería -> ingresa al inventario.
    if v_bodega is null then raise exception 'Factura sin recepción y sin bodega de ingreso.'; end if;
    for r in select * from public.facturas_compra_lineas where factura_id = p_factura order by linea loop
      insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha, 'compra', r.cantidad, r.costo_unitario, 'factura_compra', p_factura, r.detalle);
    end loop;
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_inv, 'debito', v_sub, 'detalle','Compra (inventario)'),
      jsonb_build_object('cuenta_id', v_cta_iva, 'debito', v_iva, 'detalle','IVA crédito'),
      jsonb_build_object('cuenta_id', v_cta_cxp, 'credito', v_tot, 'detalle','Cuentas por pagar'));
  else
    -- CASO B: salda una recepción previa (el inventario ya entró).
    select coalesce(sum(round(cantidad*costo_unitario,2)),0) into v_puente_val
      from public.recepciones_lineas where recepcion_id = v_recep;
    v_diff := v_sub - v_puente_val;   -- diferencia de precio de la factura

    -- Ajusta el VALOR del inventario por la diferencia, por artículo.
    if v_diff <> 0 then
      for r in
        select fl.articulo_id,
               sum(fl.base_imponible) - coalesce((select sum(round(rl.cantidad*rl.costo_unitario,2))
                     from public.recepciones_lineas rl where rl.recepcion_id=v_recep and rl.articulo_id=fl.articulo_id),0) as d
          from public.facturas_compra_lineas fl where fl.factura_id=p_factura
         group by fl.articulo_id
        having sum(fl.base_imponible) - coalesce((select sum(round(rl.cantidad*rl.costo_unitario,2))
                     from public.recepciones_lineas rl where rl.recepcion_id=v_recep and rl.articulo_id=fl.articulo_id),0) <> 0
      loop
        insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, costo_total, origen_tipo, origen_id, detalle)
        select r.articulo_id, re.bodega_id, 'ajuste_valor', 0, r.d, 'factura_compra', p_factura, 'Diferencia de precio en factura'
          from public.recepciones re where re.id = v_recep;
      end loop;
    end if;

    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_puente, 'debito', v_puente_val, 'detalle','Salda mercadería recibida por facturar'),
      jsonb_build_object('cuenta_id', v_cta_iva,    'debito', v_iva,        'detalle','IVA crédito'),
      jsonb_build_object('cuenta_id', v_cta_cxp,    'credito', v_tot,       'detalle','Cuentas por pagar'));
    if v_diff > 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_inv, 'debito', v_diff, 'detalle','Diferencia de precio');
    elsif v_diff < 0 then
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_inv, 'credito', -v_diff, 'detalle','Diferencia de precio');
    end if;

    update public.recepciones set facturada = true where id = v_recep;
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Factura de compra', 'factura_compra', p_factura, v_lineas);

  insert into public.cuentas_por_pagar (proveedor_id, factura_id, fecha, fecha_vencimiento, monto_original, saldo)
  values (v_prov, p_factura, v_fecha, v_venc, v_tot, v_tot);

  update public.facturas_compra set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id = p_factura;
  return v_asiento;
end $$;

-- =============================================================================
-- ANULAR FACTURA
-- =============================================================================
create or replace function public.fn_anular_factura(p_factura uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_recep uuid; v_bodega uuid; r record; v_saldo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, recepcion_id, bodega_id into v_estado, v_recep, v_bodega from public.facturas_compra where id = p_factura;
  if v_estado is null then raise exception 'Factura inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una factura confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  -- La CxP no puede tener pagos aplicados.
  select saldo into v_saldo from public.cuentas_por_pagar where factura_id = p_factura;
  if v_saldo is not null and exists (select 1 from public.cxp_aplicaciones a join public.cuentas_por_pagar c on c.id=a.cxp_id where c.factura_id=p_factura) then
    raise exception 'La factura tiene pagos/aplicaciones: revertilos antes de anular.';
  end if;

  -- Reversa del kardex de la factura (compra e ajuste_valor).
  for r in select articulo_id, bodega_id, tipo, cantidad, costo_total from public.movimientos_inventario
            where origen_tipo='factura_compra' and origen_id=p_factura order by creado_en loop
    if r.tipo='compra' then
      insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, r.bodega_id, 'devolucion_compra', -r.cantidad, 'factura_anulacion', p_factura, 'Reversa de factura anulada');
    elsif r.tipo='ajuste_valor' then
      insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, costo_total, origen_tipo, origen_id, detalle)
      values (r.articulo_id, r.bodega_id, 'ajuste_valor', 0, -r.costo_total, 'factura_anulacion', p_factura, 'Reversa de diferencia de precio');
    end if;
  end loop;

  perform public.fn_anular_asiento_auto('factura_compra', p_factura, p_motivo);
  update public.cuentas_por_pagar set estado='anulada', saldo=0 where factura_id = p_factura;
  if v_recep is not null then update public.recepciones set facturada=false where id = v_recep; end if;
  update public.facturas_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_factura;
end $$;

grant execute on function public.fn_confirmar_factura(uuid) to authenticated;
grant execute on function public.fn_anular_factura(uuid, text) to authenticated;

-- === RLS (compras.facturar; visibilidad por sucursal vía recepción/bodega) ===
alter table public.facturas_compra        enable row level security;
alter table public.facturas_compra_lineas  enable row level security;
alter table public.facturas_compra_otros_impuestos enable row level security;
alter table public.cuentas_por_pagar       enable row level security;
alter table public.cxp_aplicaciones        enable row level security;

create policy fc_sel on public.facturas_compra for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy fc_wr on public.facturas_compra for all to authenticated
  using (public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));
create policy fcl_all on public.facturas_compra_lineas for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));
create policy fcoi_all on public.facturas_compra_otros_impuestos for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));
create policy cxp_sel on public.cuentas_por_pagar for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy cxpa_sel on public.cxp_aplicaciones for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));

do $$
begin
  raise notice 'Factura de compra + CxP listas (caso 1 paso y saldar puente con diferencia de precio).';
end $$;
