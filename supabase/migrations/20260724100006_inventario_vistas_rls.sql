-- =============================================================================
-- Fase 3 — Migración 7: vistas del kardex, libro de Inventarios, y RLS.
--
-- RLS del inventario por SUCURSAL (reusa mis_sucursales()), a diferencia de la
-- contabilidad que es por permiso. El bodeguero de Chepito 1 ve el stock de
-- Chepito 1. Las vistas van con security_invoker para que la RLS de las tablas
-- fluya (no filtrar en la vista sería una fuga).
-- =============================================================================

-- === PERMISOS NUEVOS ========================================================
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('inventario', 'ver',       'inventario.ver',       'Ver existencias y kardex'),
  ('inventario', 'ajustar',   'inventario.ajustar',   'Crear/confirmar/anular ajustes'),
  ('inventario', 'transferir','inventario.transferir','Enviar y recibir transferencias'),
  ('articulos',  'gestionar', 'articulos.gestionar',  'Gestionar el catálogo de artículos'),
  ('proveedores','gestionar', 'proveedores.gestionar','Gestionar proveedores y su mapeo')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r cross join public.permisos p
 where r.codigo = 'administrador' on conflict do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r
  join public.permisos p on p.codigo in
    ('inventario.ver','inventario.ajustar','inventario.transferir','articulos.gestionar')
 where r.codigo = 'bodeguero' on conflict do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r
  join public.permisos p on p.codigo = 'inventario.ver'
 where r.codigo = 'contador' on conflict do nothing;

-- === HELPER: bodegas visibles para el usuario actual ========================
create or replace function public.fn_bodegas_visibles()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select b.id from public.bodegas b where b.sucursal_id in (select public.mis_sucursales());
$$;
grant execute on function public.fn_bodegas_visibles() to authenticated;

-- === CHEQUEO DE PERMISO EN LAS FUNCIONES DE DOCUMENTO ========================
-- Las funciones de documento son SECURITY DEFINER (bypasean RLS), así que deben
-- validar el permiso ellas mismas. auth.uid() NULL = servidor (posteo auto).
create or replace function public.fn_confirmar_ajuste(p_ajuste uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; v_centro uuid; r record;
  v_pos numeric(18,2) := 0; v_neg numeric(18,2) := 0; v_lineas jsonb := '[]'::jsonb;
  v_cta_inv uuid; v_cta_merma uuid; v_cta_sobra uuid; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado, fecha, bodega_id into v_estado, v_fecha, v_bodega
    from public.ajustes_inventario where id = p_ajuste;
  if v_estado is null then raise exception 'Ajuste inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El ajuste ya está %.', v_estado; end if;
  if not exists (select 1 from public.ajustes_inventario_lineas where ajuste_id = p_ajuste) then
    raise exception 'El ajuste no tiene líneas.'; end if;

  v_centro := public.fn_centro_de_bodega(v_bodega);
  if v_centro is null then raise exception 'La bodega no tiene centro de costo asociado.'; end if;
  select id into v_cta_inv   from public.cuentas where codigo = '11-60-01-00-00';
  select id into v_cta_merma from public.cuentas where codigo = '51-30-01-02-00';
  select id into v_cta_sobra from public.cuentas where codigo = '52-02-00-00-00';

  for r in select * from public.ajustes_inventario_lineas where ajuste_id = p_ajuste order by linea loop
    if r.direccion = 'pos' then
      insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha, 'ajuste_pos', r.cantidad, 'ajuste', p_ajuste, r.detalle);
      v_pos := v_pos + (select costo_total from public.movimientos_inventario
        where origen_tipo='ajuste' and origen_id=p_ajuste and articulo_id=r.articulo_id and tipo='ajuste_pos'
        order by creado_en desc limit 1);
    else
      insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha, 'ajuste_neg', -r.cantidad, 'ajuste', p_ajuste, r.detalle);
      v_neg := v_neg + abs((select costo_total from public.movimientos_inventario
        where origen_tipo='ajuste' and origen_id=p_ajuste and articulo_id=r.articulo_id and tipo='ajuste_neg'
        order by creado_en desc limit 1));
    end if;
  end loop;

  if v_pos > 0 then
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', v_cta_inv,   'debito',  v_pos, 'detalle','Sobrante de inventario')
      || jsonb_build_object('cuenta_id', v_cta_sobra, 'credito', v_pos, 'centro_costo_id', v_centro, 'detalle','Sobrante de inventario');
  end if;
  if v_neg > 0 then
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', v_cta_merma, 'debito',  v_neg, 'centro_costo_id', v_centro, 'detalle','Merma de inventario')
      || jsonb_build_object('cuenta_id', v_cta_inv,   'credito', v_neg, 'detalle','Merma de inventario');
  end if;
  if jsonb_array_length(v_lineas) > 0 then
    v_asiento := public.fn_postear_asiento('diario', v_fecha, 'Ajuste de inventario', 'ajuste', p_ajuste, v_lineas);
  end if;

  update public.ajustes_inventario
     set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_ajuste;
  return v_asiento;
end $$;

create or replace function public.fn_anular_ajuste(p_ajuste uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_bodega uuid; r record;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado, bodega_id into v_estado, v_bodega from public.ajustes_inventario where id = p_ajuste;
  if v_estado is null then raise exception 'Ajuste inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un ajuste confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo))=0 then raise exception 'La anulación exige un motivo.'; end if;

  for r in select articulo_id, tipo, cantidad from public.movimientos_inventario
            where origen_tipo='ajuste' and origen_id=p_ajuste order by creado_en loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega,
      case when r.tipo='ajuste_pos' then 'ajuste_neg' else 'ajuste_pos' end, -r.cantidad,
      'ajuste_anulacion', p_ajuste, 'Reversa de ajuste anulado');
  end loop;

  perform public.fn_anular_asiento_auto('ajuste', p_ajuste, p_motivo);
  update public.ajustes_inventario set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_ajuste;
end $$;

create or replace function public.fn_enviar_transferencia(p_transf uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_fecha date; v_origen uuid; r record;
begin
  perform public.fn_exigir_permiso('inventario.transferir');
  select estado, fecha, bodega_origen_id into v_estado, v_fecha, v_origen from public.transferencias where id = p_transf;
  if v_estado is null then raise exception 'Transferencia inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'Solo se envía una transferencia en borrador (está %).', v_estado; end if;
  if not exists (select 1 from public.transferencias_lineas where transferencia_id = p_transf) then
    raise exception 'La transferencia no tiene líneas.'; end if;
  for r in select * from public.transferencias_lineas where transferencia_id = p_transf order by linea loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_origen, v_fecha, 'transferencia_envio', -r.cantidad_enviada, 'transferencia', p_transf, 'Envío');
  end loop;
  update public.transferencias set estado='en_transito', enviada_en=now(), enviada_por=auth.uid() where id = p_transf;
end $$;

create or replace function public.fn_recibir_transferencia(p_transf uuid, p_recibidas jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_fecha date; v_destino uuid; r record; v_recibe numeric(18,4); v_item jsonb;
begin
  perform public.fn_exigir_permiso('inventario.transferir');
  select estado, fecha, bodega_destino_id into v_estado, v_fecha, v_destino from public.transferencias where id = p_transf;
  if v_estado is null then raise exception 'Transferencia inexistente.'; end if;
  if v_estado <> 'en_transito' then raise exception 'Solo se recibe una transferencia en tránsito (está %).', v_estado; end if;
  for r in select * from public.transferencias_lineas where transferencia_id = p_transf order by linea loop
    if p_recibidas is null then v_recibe := r.cantidad_enviada - r.cantidad_recibida;
    else
      v_recibe := 0;
      for v_item in select * from jsonb_array_elements(p_recibidas) loop
        if (v_item->>'linea')::int = r.linea then v_recibe := (v_item->>'cantidad')::numeric; end if;
      end loop;
    end if;
    if v_recibe < 0 then raise exception 'Cantidad recibida negativa en línea %.', r.linea; end if;
    if r.cantidad_recibida + v_recibe > r.cantidad_enviada then
      raise exception 'Línea %: no se puede recibir más de lo enviado.', r.linea; end if;
    if v_recibe > 0 then
      insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_destino, v_fecha, 'transferencia_recepcion', v_recibe, 'transferencia', p_transf, 'Recepción');
      update public.transferencias_lineas set cantidad_recibida = cantidad_recibida + v_recibe where id = r.id;
    end if;
  end loop;
  if not exists (select 1 from public.transferencias_lineas where transferencia_id = p_transf and cantidad_recibida < cantidad_enviada) then
    update public.transferencias set estado='recibida', recibida_en=now(), recibida_por=auth.uid() where id = p_transf;
  end if;
end $$;

grant execute on function public.fn_confirmar_ajuste(uuid) to authenticated;
grant execute on function public.fn_anular_ajuste(uuid, text) to authenticated;
grant execute on function public.fn_enviar_transferencia(uuid) to authenticated;
grant execute on function public.fn_recibir_transferencia(uuid, jsonb) to authenticated;

-- === VISTAS (security_invoker: la RLS de las tablas fluye) ===================
create or replace view public.v_existencias_valoradas
  with (security_invoker = true) as
select a.id articulo_id, a.codigo articulo_codigo, a.nombre articulo_nombre,
       b.id bodega_id, b.codigo bodega_codigo, b.nombre bodega_nombre, b.sucursal_id,
       e.cantidad, s.costo_promedio, round(e.cantidad * s.costo_promedio, 2) as valor
from public.existencias e
join public.articulos a on a.id = e.articulo_id
join public.bodegas b on b.id = e.bodega_id
left join public.articulos_saldos s on s.articulo_id = e.articulo_id
where e.cantidad <> 0;

create or replace view public.v_inventario_transito
  with (security_invoker = true) as
select t.id transferencia_id, t.fecha, bo.codigo origen, bd.codigo destino,
       a.codigo articulo_codigo, a.nombre articulo_nombre,
       l.cantidad_enviada, l.cantidad_recibida, (l.cantidad_enviada - l.cantidad_recibida) en_transito
from public.transferencias t
join public.transferencias_lineas l on l.transferencia_id = t.id
join public.articulos a on a.id = l.articulo_id
join public.bodegas bo on bo.id = t.bodega_origen_id
join public.bodegas bd on bd.id = t.bodega_destino_id
where t.estado = 'en_transito' and l.cantidad_recibida < l.cantidad_enviada;

create or replace view public.v_kardex
  with (security_invoker = true) as
select m.id, m.articulo_id, a.codigo articulo_codigo, a.nombre articulo_nombre,
       m.bodega_id, b.codigo bodega_codigo, b.sucursal_id,
       m.fecha, m.tipo, m.cantidad, m.costo_unitario, m.costo_total,
       m.existencia_despues, m.promedio_despues, m.origen_tipo, m.origen_id, m.detalle, m.creado_en
from public.movimientos_inventario m
join public.articulos a on a.id = m.articulo_id
join public.bodegas b on b.id = m.bodega_id;

-- === LIBRO DE INVENTARIOS (detalle valuado por ítem a una fecha) ============
-- La mitad "Inventarios" del tercer libro obligatorio (la de "Balances" ya
-- salió de Fase 2). Se reconstruye del kardex inmutable a la fecha de corte.
create or replace function public.fn_libro_inventarios(p_fecha date)
returns table (
  articulo_codigo text, articulo_nombre text, bodega_codigo text,
  cantidad numeric(18,4), costo_promedio numeric(18,4), valor numeric(18,2)
)
language sql stable security invoker
as $$
  with prom as (
    select distinct on (articulo_id) articulo_id, promedio_despues
      from public.movimientos_inventario where fecha <= p_fecha
      order by articulo_id, fecha desc, creado_en desc
  ),
  qty as (
    select articulo_id, bodega_id, sum(cantidad) cantidad
      from public.movimientos_inventario where fecha <= p_fecha
      group by articulo_id, bodega_id having sum(cantidad) <> 0
  )
  select a.codigo, a.nombre, b.codigo,
         q.cantidad, coalesce(p.promedio_despues,0),
         round(q.cantidad * coalesce(p.promedio_despues,0), 2)
  from qty q
  join public.articulos a on a.id = q.articulo_id
  join public.bodegas b on b.id = q.bodega_id
  left join prom p on p.articulo_id = q.articulo_id
  order by a.codigo, b.codigo;
$$;
comment on function public.fn_libro_inventarios(date) is
  'Mitad "Inventarios" del libro de Inventarios y Balances: detalle valuado por '
  'ítem y bodega a una fecha, reconstruido del kardex.';

-- =============================================================================
-- RLS
-- =============================================================================
-- Catálogos globales: lectura abierta (se necesitan para armar documentos);
-- escritura por permiso. articulos_saldos (costos) solo con inventario.ver.
alter table public.unidades            enable row level security;
alter table public.iva_tarifas         enable row level security;
alter table public.articulos           enable row level security;
alter table public.articulos_saldos    enable row level security;
alter table public.proveedores         enable row level security;
alter table public.proveedor_articulos enable row level security;
alter table public.existencias         enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.ajustes_inventario     enable row level security;
alter table public.ajustes_inventario_lineas enable row level security;
alter table public.transferencias         enable row level security;
alter table public.transferencias_lineas  enable row level security;

create policy unidades_sel on public.unidades for select to authenticated using (true);
create policy unidades_wr  on public.unidades for all to authenticated
  using (public.tengo_permiso('articulos.gestionar')) with check (public.tengo_permiso('articulos.gestionar'));

create policy iva_sel on public.iva_tarifas for select to authenticated using (true);
create policy iva_wr  on public.iva_tarifas for all to authenticated
  using (public.tengo_permiso('articulos.gestionar')) with check (public.tengo_permiso('articulos.gestionar'));

create policy art_sel on public.articulos for select to authenticated using (true);
create policy art_wr  on public.articulos for all to authenticated
  using (public.tengo_permiso('articulos.gestionar')) with check (public.tengo_permiso('articulos.gestionar'));

-- articulos_saldos: solo lectura, y solo con inventario.ver (los costos son
-- sensibles). Lo escribe únicamente el motor de kardex (vía funciones DEFINER).
create policy saldos_sel on public.articulos_saldos for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('inventario.ver'));

create policy prov_sel on public.proveedores for select to authenticated using (true);
create policy prov_wr  on public.proveedores for all to authenticated
  using (public.tengo_permiso('proveedores.gestionar')) with check (public.tengo_permiso('proveedores.gestionar'));

create policy provart_sel on public.proveedor_articulos for select to authenticated using (true);
create policy provart_wr  on public.proveedor_articulos for all to authenticated
  using (public.tengo_permiso('proveedores.gestionar')) with check (public.tengo_permiso('proveedores.gestionar'));

-- Por sucursal: existencias y kardex son solo lectura para el usuario (los
-- escribe el motor vía funciones DEFINER).
create policy exist_sel on public.existencias for select to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('inventario.ver') and bodega_id in (select public.fn_bodegas_visibles())));

create policy mov_sel on public.movimientos_inventario for select to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('inventario.ver') and bodega_id in (select public.fn_bodegas_visibles())));

-- Ajustes: el usuario crea el borrador (header+líneas) directo; confirmar/anular
-- van por función. Ver/crear por sucursal + permiso.
create policy aj_sel on public.ajustes_inventario for select to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('inventario.ver') and bodega_id in (select public.fn_bodegas_visibles())));
create policy aj_ins on public.ajustes_inventario for insert to authenticated
  with check (public.tengo_permiso('inventario.ajustar') and bodega_id in (select public.fn_bodegas_visibles()));
create policy aj_upd on public.ajustes_inventario for update to authenticated
  using (public.tengo_permiso('inventario.ajustar') and bodega_id in (select public.fn_bodegas_visibles()))
  with check (public.tengo_permiso('inventario.ajustar') and bodega_id in (select public.fn_bodegas_visibles()));

create policy ajl_all on public.ajustes_inventario_lineas for all to authenticated
  using (exists (select 1 from public.ajustes_inventario a where a.id = ajuste_id
                  and (public.soy_administrador() or (public.tengo_permiso('inventario.ajustar') and a.bodega_id in (select public.fn_bodegas_visibles())))))
  with check (exists (select 1 from public.ajustes_inventario a where a.id = ajuste_id
                  and public.tengo_permiso('inventario.ajustar') and a.bodega_id in (select public.fn_bodegas_visibles())));

-- Transferencias: visible si veo el origen o el destino; crear necesita ver el origen.
create policy tr_sel on public.transferencias for select to authenticated
  using (public.soy_administrador() or (public.tengo_permiso('inventario.ver')
         and (bodega_origen_id in (select public.fn_bodegas_visibles()) or bodega_destino_id in (select public.fn_bodegas_visibles()))));
create policy tr_ins on public.transferencias for insert to authenticated
  with check (public.tengo_permiso('inventario.transferir') and bodega_origen_id in (select public.fn_bodegas_visibles()));
create policy tr_upd on public.transferencias for update to authenticated
  using (public.tengo_permiso('inventario.transferir')
         and (bodega_origen_id in (select public.fn_bodegas_visibles()) or bodega_destino_id in (select public.fn_bodegas_visibles())))
  with check (true);

create policy trl_all on public.transferencias_lineas for all to authenticated
  using (exists (select 1 from public.transferencias t where t.id = transferencia_id
                  and (public.soy_administrador() or (public.tengo_permiso('inventario.transferir')
                       and (t.bodega_origen_id in (select public.fn_bodegas_visibles()) or t.bodega_destino_id in (select public.fn_bodegas_visibles()))))))
  with check (exists (select 1 from public.transferencias t where t.id = transferencia_id
                  and public.tengo_permiso('inventario.transferir') and t.bodega_origen_id in (select public.fn_bodegas_visibles())));

do $$
begin
  raise notice 'Vistas, libro de Inventarios y RLS por sucursal listos.';
end $$;
