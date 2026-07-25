-- =============================================================================
-- Fase 3 — Migración 5a: compras · recepciones.
--
-- La recepción ingresa la mercadería al inventario. Puede existir SIN factura
-- (recibí, la factura llega después). Postea:
--   Debe Inventario (11-60-01) / Haber Mercadería recibida por facturar (21-10-25)
-- Cuando llegue la factura (migración 5b), esta salda ese puente contra CxP+IVA.
-- =============================================================================

-- 1. Cuenta puente (confirmada por el usuario): 21-10-25.
insert into public.cuentas (codigo, nombre, cuenta_padre_id, nivel, tipo, naturaleza, acepta_movimiento, subtipo_codigo)
select '21-10-25-00-00', 'Mercadería recibida por facturar',
       (select id from public.cuentas where codigo='21-10-00-00-00'),
       3, 'pasivo', 'acreedora', true,
       (select subtipo_codigo from public.cuentas where codigo='21-10-01-00-00')
where not exists (select 1 from public.cuentas where codigo='21-10-25-00-00');

-- 2. Tipo de kardex 'ajuste_valor': cambia el VALOR sin mover la cantidad
--    (diferencias de precio de factura tardía, costos de importación, etc.).
--    Requiere permitir cantidad = 0 solo para este tipo.
alter table public.movimientos_inventario drop constraint movimientos_inventario_cantidad_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_cantidad_check
  check (cantidad <> 0 or tipo = 'ajuste_valor');
alter table public.movimientos_inventario drop constraint movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo in (
    'saldo_inicial','compra','ajuste_pos','transferencia_recepcion',
    'ajuste_neg','transferencia_envio','devolucion_compra',
    'venta','produccion_consumo','produccion_entrada','devolucion_venta',
    'ajuste_valor'));

-- El motor: ajuste_valor suma costo_total al valor y recalcula el promedio,
-- sin tocar la cantidad. Se maneja al inicio, antes de la lógica de signo.
create or replace function public.fn_kardex_movimiento()
returns trigger language plpgsql as $$
declare
  v_existe numeric(18,4); v_valor numeric(18,2); v_prom numeric(18,4);
  v_bod numeric(18,4); v_nuevo_ex numeric(18,4); v_valor_mov numeric(18,2);
  es_entrada boolean; trae_costo boolean; guarda_neg boolean; es_transfer boolean;
begin
  -- Asegura y bloquea la fila de saldos (serializa por artículo).
  insert into public.articulos_saldos (articulo_id) values (new.articulo_id)
    on conflict (articulo_id) do nothing;
  select existencia_total, valor_total, costo_promedio into v_existe, v_valor, v_prom
    from public.articulos_saldos where articulo_id = new.articulo_id for update;

  -- --- AJUSTE DE VALOR (cantidad 0): solo mueve el dinero -----------------
  if new.tipo = 'ajuste_valor' then
    if new.cantidad <> 0 then raise exception 'ajuste_valor lleva cantidad 0.'; end if;
    v_valor := v_valor + new.costo_total;              -- costo_total lo da el caller
    if v_valor < 0 then raise exception 'El ajuste de valor dejaría el inventario en negativo.'; end if;
    v_prom := case when v_existe > 0 then round(v_valor / v_existe, 4) else 0 end;
    new.costo_unitario := 0;
    new.existencia_despues := v_existe;
    new.promedio_despues := v_prom;
    update public.articulos_saldos
       set valor_total = v_valor, costo_promedio = v_prom, actualizado_en = now()
     where articulo_id = new.articulo_id;
    return new;
  end if;

  es_entrada  := new.tipo in ('saldo_inicial','compra','ajuste_pos','transferencia_recepcion','produccion_entrada','devolucion_venta');
  trae_costo  := new.tipo in ('saldo_inicial','compra');
  guarda_neg  := new.tipo in ('ajuste_neg','transferencia_envio','devolucion_compra');
  es_transfer := new.tipo in ('transferencia_envio','transferencia_recepcion');

  if es_entrada and new.cantidad <= 0 then raise exception 'El tipo % es una entrada: la cantidad debe ser positiva.', new.tipo; end if;
  if not es_entrada and new.cantidad >= 0 then raise exception 'El tipo % es una salida: la cantidad debe ser negativa.', new.tipo; end if;

  select cantidad into v_bod from public.existencias
   where articulo_id = new.articulo_id and bodega_id = new.bodega_id for update;
  v_bod := coalesce(v_bod, 0);
  if guarda_neg and (v_bod + new.cantidad) < 0 then
    raise exception 'Existencia insuficiente: la bodega tiene % y la operación % saca %.', v_bod, new.tipo, abs(new.cantidad);
  end if;

  if es_transfer then
    new.costo_unitario := v_prom;
    new.costo_total := round(new.cantidad * v_prom, 2);
    new.existencia_despues := v_bod + new.cantidad;
    new.promedio_despues := v_prom;
  else
    v_nuevo_ex := v_existe + new.cantidad;
    if trae_costo then
      if new.costo_unitario is null then raise exception 'El tipo % exige costo_unitario.', new.tipo; end if;
      v_valor_mov := round(new.cantidad * new.costo_unitario, 2);
      v_valor := v_valor + v_valor_mov;
    elsif es_entrada then
      v_valor_mov := round(new.cantidad * v_prom, 2);
      new.costo_unitario := v_prom;
      v_valor := v_valor + v_valor_mov;
    else
      if v_nuevo_ex = 0 then v_valor_mov := -v_valor;
      else v_valor_mov := -round(abs(new.cantidad) * v_prom, 2); end if;
      new.costo_unitario := v_prom;
      v_valor := v_valor + v_valor_mov;
    end if;
    v_prom := case when v_nuevo_ex > 0 then round(v_valor / v_nuevo_ex, 4) else 0 end;
    new.costo_total := v_valor_mov;
    new.existencia_despues := v_bod + new.cantidad;
    new.promedio_despues := v_prom;
    update public.articulos_saldos
       set existencia_total = v_nuevo_ex, valor_total = v_valor, costo_promedio = v_prom, actualizado_en = now()
     where articulo_id = new.articulo_id;
  end if;

  insert into public.existencias (articulo_id, bodega_id, cantidad)
  values (new.articulo_id, new.bodega_id, new.cantidad)
  on conflict (articulo_id, bodega_id) do update set cantidad = public.existencias.cantidad + excluded.cantidad;
  return new;
end $$;

-- =============================================================================
-- ÓRDENES DE COMPRA (opcional, sin asiento — es un compromiso)
-- =============================================================================
create table public.ordenes_compra (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  bodega_id      uuid not null references public.bodegas(id),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  glosa          text,
  estado         text not null default 'borrador' check (estado in ('borrador','emitida','cerrada','anulada')),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.ordenes_compra_lineas (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references public.ordenes_compra(id) on delete cascade,
  linea         int not null,
  articulo_id   uuid not null references public.articulos(id),
  cantidad_ordenada  numeric(18,4) not null check (cantidad_ordenada > 0),
  cantidad_recibida  numeric(18,4) not null default 0,
  cantidad_facturada numeric(18,4) not null default 0,
  costo_unitario numeric(18,4) not null default 0,
  unique (orden_id, linea)
);
select public.fn_adjuntar_auditoria('public.ordenes_compra');

-- =============================================================================
-- RECEPCIONES
-- =============================================================================
create table public.recepciones (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores(id),
  bodega_id      uuid not null references public.bodegas(id),
  orden_compra_id uuid references public.ordenes_compra(id),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  glosa          text,
  estado         text not null default 'borrador' check (estado in ('borrador','confirmada','anulada')),
  asiento_id     uuid references public.asientos(id),
  facturada      boolean not null default false,  -- la marca la factura al saldarla
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmada_en  timestamptz, confirmada_por uuid,
  anulada_en     timestamptz, anulada_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.recepciones_lineas (
  id            uuid primary key default gen_random_uuid(),
  recepcion_id  uuid not null references public.recepciones(id) on delete cascade,
  linea         int not null,
  articulo_id   uuid not null references public.articulos(id),
  cantidad      numeric(18,4) not null check (cantidad > 0),
  costo_unitario numeric(18,4) not null check (costo_unitario >= 0),
  detalle       text,
  unique (recepcion_id, linea)
);
select public.fn_adjuntar_auditoria('public.recepciones');

create trigger trg_recep_no_delete before delete on public.recepciones
  for each row execute function public.fn_bloquear_delete();

create or replace function public.fn_recep_lineas_solo_borrador()
returns trigger language plpgsql as $$
declare v_estado text; v_id uuid;
begin
  v_id := case when tg_op='DELETE' then old.recepcion_id else new.recepcion_id end;
  select estado into v_estado from public.recepciones where id = v_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'La recepción está %: sus líneas son inmutables.', v_estado;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_recep_lineas_borrador
  before insert or update or delete on public.recepciones_lineas
  for each row execute function public.fn_recep_lineas_solo_borrador();

-- CONFIRMAR: ingresa al inventario y postea al puente.
create or replace function public.fn_confirmar_recepcion(p_recep uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; r record;
  v_total numeric(18,2) := 0; v_cta_inv uuid; v_cta_puente uuid; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('compras.recibir');
  select estado, fecha, bodega_id into v_estado, v_fecha, v_bodega from public.recepciones where id = p_recep;
  if v_estado is null then raise exception 'Recepción inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La recepción ya está %.', v_estado; end if;
  if not exists (select 1 from public.recepciones_lineas where recepcion_id = p_recep) then
    raise exception 'La recepción no tiene líneas.'; end if;

  select id into v_cta_inv    from public.cuentas where codigo='11-60-01-00-00';
  select id into v_cta_puente from public.cuentas where codigo='21-10-25-00-00';

  for r in select * from public.recepciones_lineas where recepcion_id = p_recep order by linea loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, v_fecha, 'compra', r.cantidad, r.costo_unitario, 'recepcion', p_recep, r.detalle);
    v_total := v_total + round(r.cantidad * r.costo_unitario, 2);
  end loop;

  v_asiento := public.fn_postear_asiento('egreso', v_fecha, 'Recepción de mercadería', 'recepcion', p_recep,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cta_inv,    'debito',  v_total, 'detalle','Ingreso a inventario'),
      jsonb_build_object('cuenta_id', v_cta_puente, 'credito', v_total, 'detalle','Mercadería recibida por facturar')
    ));

  update public.recepciones set estado='confirmada', asiento_id=v_asiento, confirmada_en=now(), confirmada_por=auth.uid() where id = p_recep;
  return v_asiento;
end $$;

-- ANULAR: reversa kardex + anula asiento (solo si aún no está facturada).
create or replace function public.fn_anular_recepcion(p_recep uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_bodega uuid; v_fact boolean; r record;
begin
  perform public.fn_exigir_permiso('compras.recibir');
  select estado, bodega_id, facturada into v_estado, v_bodega, v_fact from public.recepciones where id = p_recep;
  if v_estado is null then raise exception 'Recepción inexistente.'; end if;
  if v_estado <> 'confirmada' then raise exception 'Solo se anula una recepción confirmada (está %).', v_estado; end if;
  if v_fact then raise exception 'La recepción ya fue facturada: anulá primero la factura.'; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  for r in select articulo_id, cantidad from public.movimientos_inventario
            where origen_tipo='recepcion' and origen_id=p_recep and tipo='compra' order by creado_en loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, 'devolucion_compra', -r.cantidad, 'recepcion_anulacion', p_recep, 'Reversa de recepción anulada');
  end loop;

  perform public.fn_anular_asiento_auto('recepcion', p_recep, p_motivo);
  update public.recepciones set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_recep;
end $$;

-- === PERMISOS + RLS ===
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('compras','recibir', 'compras.recibir', 'Crear y confirmar recepciones'),
  ('compras','facturar','compras.facturar','Registrar facturas de compra y CxP'),
  ('compras','ordenar', 'compras.ordenar', 'Crear órdenes de compra')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r cross join public.permisos p where r.codigo='administrador' on conflict do nothing;
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo in ('compras.recibir','compras.ordenar')
 where r.codigo='bodeguero' on conflict do nothing;
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo='compras.facturar'
 where r.codigo='contador' on conflict do nothing;

grant execute on function public.fn_confirmar_recepcion(uuid) to authenticated;
grant execute on function public.fn_anular_recepcion(uuid, text) to authenticated;

alter table public.ordenes_compra        enable row level security;
alter table public.ordenes_compra_lineas  enable row level security;
alter table public.recepciones            enable row level security;
alter table public.recepciones_lineas     enable row level security;

create policy oc_sel on public.ordenes_compra for select to authenticated
  using (public.soy_administrador() or bodega_id in (select public.fn_bodegas_visibles()));
create policy oc_wr on public.ordenes_compra for all to authenticated
  using (public.tengo_permiso('compras.ordenar') and bodega_id in (select public.fn_bodegas_visibles()))
  with check (public.tengo_permiso('compras.ordenar') and bodega_id in (select public.fn_bodegas_visibles()));
create policy ocl_all on public.ordenes_compra_lineas for all to authenticated
  using (exists (select 1 from public.ordenes_compra o where o.id=orden_id and (public.soy_administrador() or o.bodega_id in (select public.fn_bodegas_visibles()))))
  with check (exists (select 1 from public.ordenes_compra o where o.id=orden_id and public.tengo_permiso('compras.ordenar') and o.bodega_id in (select public.fn_bodegas_visibles())));

create policy rec_sel on public.recepciones for select to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('inventario.ver') and bodega_id in (select public.fn_bodegas_visibles())));
create policy rec_ins on public.recepciones for insert to authenticated
  with check (public.tengo_permiso('compras.recibir') and bodega_id in (select public.fn_bodegas_visibles()));
create policy rec_upd on public.recepciones for update to authenticated
  using (public.tengo_permiso('compras.recibir') and bodega_id in (select public.fn_bodegas_visibles()))
  with check (public.tengo_permiso('compras.recibir') and bodega_id in (select public.fn_bodegas_visibles()));
create policy recl_all on public.recepciones_lineas for all to authenticated
  using (exists (select 1 from public.recepciones re where re.id=recepcion_id and (public.soy_administrador() or (public.tengo_permiso('compras.recibir') and re.bodega_id in (select public.fn_bodegas_visibles())))))
  with check (exists (select 1 from public.recepciones re where re.id=recepcion_id and public.tengo_permiso('compras.recibir') and re.bodega_id in (select public.fn_bodegas_visibles())));

do $$
begin
  raise notice 'Recepciones + cuenta puente 21-10-25 + tipo ajuste_valor listos.';
end $$;
