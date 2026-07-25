-- =============================================================================
-- Fase 3 — Migración 5c: devoluciones de compra.
--
-- Devolver producto (malo) al proveedor: baja inventario (al promedio), revierte
-- el IVA acreditable y baja la CxP.
--   Debe CxP (total) / Haber Inventario (valor al promedio) + Haber IVA crédito
--                     + Haber/Debe Devoluciones sobre compras (diferencia)
-- =============================================================================

create table public.devoluciones_compra (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  factura_id     uuid references public.facturas_compra(id),   -- para bajar su CxP
  bodega_id      uuid not null references public.bodegas(id),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  motivo         text not null check (length(btrim(motivo)) > 0),
  subtotal       numeric(18,2) not null default 0,   -- base de lo devuelto (precio factura)
  iva_total      numeric(18,2) not null default 0,
  total          numeric(18,2) not null default 0,
  estado         text not null default 'borrador' check (estado in ('borrador','confirmada','anulada')),
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmada_en  timestamptz, confirmada_por uuid,
  anulada_en     timestamptz, anulada_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.devoluciones_compra_lineas (
  id            uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones_compra(id) on delete cascade,
  linea         int not null,
  articulo_id   uuid not null references public.articulos(id),
  cantidad      numeric(18,4) not null check (cantidad > 0),
  base_imponible numeric(18,2) not null,
  iva_monto     numeric(18,2) not null default 0,
  detalle       text,
  unique (devolucion_id, linea)
);
select public.fn_adjuntar_auditoria('public.devoluciones_compra');

create trigger trg_devc_no_delete before delete on public.devoluciones_compra
  for each row execute function public.fn_bloquear_delete();

create or replace function public.fn_devc_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.devolucion_id else new.devolucion_id end;
  select estado into v_estado from public.devoluciones_compra where id = v_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'La devolución está %: sus líneas son inmutables.', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_devc_lineas_borrador
  before insert or update or delete on public.devoluciones_compra_lineas
  for each row execute function public.fn_devc_lineas_solo_borrador();

create or replace function public.fn_confirmar_devolucion(p_dev uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; v_prov uuid; v_fact uuid;
  v_base numeric(18,2); v_iva numeric(18,2); v_tot numeric(18,2);
  v_inv_val numeric(18,2) := 0; v_diff numeric(18,2); r record;
  v_cta_inv uuid; v_cta_iva uuid; v_cta_cxp uuid; v_cta_dev uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid; v_cxp uuid; v_saldo numeric(18,2);
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, fecha, bodega_id, proveedor_id, factura_id, subtotal, iva_total, total
    into v_estado, v_fecha, v_bodega, v_prov, v_fact, v_base, v_iva, v_tot
    from public.devoluciones_compra where id = p_dev;
  if v_estado is null then raise exception 'Devolución inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La devolución ya está %.', v_estado; end if;
  if not exists (select 1 from public.devoluciones_compra_lineas where devolucion_id=p_dev) then
    raise exception 'La devolución no tiene líneas.'; end if;

  select id into v_cta_inv from public.cuentas where codigo='11-60-01-00-00';
  select id into v_cta_iva from public.cuentas where codigo='21-10-15-01-00';
  select id into v_cta_dev from public.cuentas where codigo = case when v_iva > 0 then '51-20-02-02-00' else '51-20-02-01-00' end;
  select coalesce(cuenta_cxp_id,(select id from public.cuentas where codigo='21-10-01-00-00'))
    into v_cta_cxp from public.proveedores where id=v_prov;

  -- Salida del kardex al promedio (el candado impide dejar negativo).
  for r in select * from public.devoluciones_compra_lineas where devolucion_id=p_dev order by linea loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, v_fecha, 'devolucion_compra', -r.cantidad, 'devolucion_compra', p_dev, r.detalle);
    v_inv_val := v_inv_val + abs((select costo_total from public.movimientos_inventario
      where origen_tipo='devolucion_compra' and origen_id=p_dev and articulo_id=r.articulo_id and tipo='devolucion_compra'
      order by creado_en desc limit 1));
  end loop;

  v_diff := v_base - v_inv_val;
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_cxp, 'debito',  v_tot,     'detalle','Baja de CxP por devolución'),
    jsonb_build_object('cuenta_id', v_cta_inv, 'credito', v_inv_val, 'detalle','Salida de inventario'));
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'credito', v_iva, 'detalle','Reversa de IVA crédito');
  end if;
  if v_diff > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dev, 'credito', v_diff, 'detalle','Devolución sobre compras');
  elsif v_diff < 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_dev, 'debito', -v_diff, 'detalle','Devolución sobre compras');
  end if;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Devolución de compra', 'devolucion_compra', p_dev, v_lineas);

  -- Baja la CxP de la factura ligada.
  if v_fact is not null then
    select id, saldo into v_cxp, v_saldo from public.cuentas_por_pagar where factura_id = v_fact;
    if v_cxp is not null then
      insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id, fecha)
      values (v_cxp, 'devolucion', v_tot, 'devolucion_compra', p_dev, v_fecha);
      update public.cuentas_por_pagar set saldo = greatest(saldo - v_tot, 0),
             estado = case when saldo - v_tot <= 0 then 'pagada' else estado end
       where id = v_cxp;
    end if;
  end if;

  update public.devoluciones_compra set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id=p_dev;
  return v_asiento;
end $$;

create or replace function public.fn_anular_devolucion(p_dev uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_bodega uuid; v_fact uuid; v_tot numeric(18,2); r record; v_cxp uuid;
begin
  perform public.fn_exigir_permiso('compras.facturar');
  select estado, bodega_id, factura_id, total into v_estado, v_bodega, v_fact, v_tot from public.devoluciones_compra where id=p_dev;
  if v_estado is null then raise exception 'Devolución inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una devolución confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Reingresa la mercadería (entrada al promedio actual).
  for r in select articulo_id, cantidad from public.movimientos_inventario
            where origen_tipo='devolucion_compra' and origen_id=p_dev and tipo='devolucion_compra' order by creado_en loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, 'ajuste_pos', -r.cantidad, 'devolucion_anulacion', p_dev, 'Reingreso por devolución anulada');
  end loop;

  perform public.fn_anular_asiento_auto('devolucion_compra', p_dev, p_motivo);

  -- Restaura la CxP.
  if v_fact is not null then
    select id into v_cxp from public.cuentas_por_pagar where factura_id = v_fact;
    if v_cxp is not null then
      insert into public.cxp_aplicaciones (cxp_id, tipo, monto, origen_tipo, origen_id) values (v_cxp, 'ajuste', v_tot, 'devolucion_anulacion', p_dev);
      update public.cuentas_por_pagar set saldo = saldo + v_tot, estado='pendiente' where id = v_cxp;
    end if;
  end if;

  update public.devoluciones_compra set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id=p_dev;
end $$;

grant execute on function public.fn_confirmar_devolucion(uuid) to authenticated;
grant execute on function public.fn_anular_devolucion(uuid, text) to authenticated;

alter table public.devoluciones_compra        enable row level security;
alter table public.devoluciones_compra_lineas  enable row level security;
create policy devc_sel on public.devoluciones_compra for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy devc_wr on public.devoluciones_compra for all to authenticated
  using (public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));
create policy devcl_all on public.devoluciones_compra_lineas for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));

do $$
begin
  raise notice 'Devoluciones de compra listas. Módulo de compras completo.';
end $$;
