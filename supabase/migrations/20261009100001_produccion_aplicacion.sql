-- =============================================================================
-- Fase 4-2 (Opción 1): aplicar al inventario la producción que las dependientas
-- anotan en la app vieja. El ERP YA lee esa producción (consumoMateriaPrima);
-- esto agrega el "descuento" real de la MP en el kardex, con un botón.
--
-- NO postea asiento: el costo ya se reconoció al comprar (modelo periódico). Esto
-- solo mueve CANTIDADES en el kardex (control), igual que la salida del método
-- perpetuo. El cierre mensual con toma física sigue cuadrando el saldo contable.
-- =============================================================================

-- 1) Recordar a qué ARTÍCULO del inventario quedó ligado un insumo manual al
--    convertirlo. Es el puente insumo (app vieja, por nombre) → artículo del ERP.
alter table public.insumos_manuales add column if not exists articulo_id uuid references public.articulos(id);

-- 2) La conversión ahora guarda ese enlace (además de reapuntar las recetas).
create or replace function public.fn_convertir_insumo(p_insumo uuid, p_articulo uuid)
returns int
language plpgsql
as $$
declare
  v_n int;
begin
  if p_insumo is null or p_articulo is null then
    raise exception 'Faltan datos: insumo y artículo son obligatorios.';
  end if;

  update public.recetas_lineas
     set tipo_ref = 'articulo', articulo_id = p_articulo, insumo_manual_id = null
   where insumo_manual_id = p_insumo
     and tipo_ref = 'insumo_manual';
  get diagnostics v_n = row_count;

  update public.insumos_manuales
     set estado = 'inactivo', articulo_id = p_articulo
   where id = p_insumo;

  return v_n;
end $$;

-- 3) Registro de cada "aplicación" de producción al inventario (para listar,
--    evitar duplicar un período y poder anular).
create table public.produccion_aplicaciones (
  id              uuid primary key default gen_random_uuid(),
  desde           date not null,
  hasta           date not null,
  bodega_id       uuid not null references public.bodegas(id),
  estado          text not null default 'aplicada' check (estado in ('aplicada','anulada')),
  nota            text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid,
  check (hasta >= desde)
);
comment on table public.produccion_aplicaciones is
  'Cada vez que se descuenta del inventario la producción de un período (leída de '
  'la app vieja). Los movimientos van al kardex con origen = esta fila.';
select public.fn_adjuntar_auditoria('public.produccion_aplicaciones');

alter table public.produccion_aplicaciones enable row level security;
create policy prodap_sel on public.produccion_aplicaciones for select to authenticated using (true);
create policy prodap_wr  on public.produccion_aplicaciones for all to authenticated
  using (public.tengo_permiso('produccion.gestionar')) with check (public.tengo_permiso('produccion.gestionar'));

-- 4) APLICAR: crea los movimientos produccion_consumo (salida al promedio) por
--    artículo. p_lineas = [{articulo_id, cantidad}] con cantidad POSITIVA (unidad
--    de stock). SECURITY DEFINER + chequeo de permiso (como el resto del posteo).
create or replace function public.fn_aplicar_produccion(
  p_desde date, p_hasta date, p_bodega uuid, p_lineas jsonb
) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_id uuid;
  v_l  jsonb;
  v_cant numeric;
begin
  perform public.fn_exigir_permiso('produccion.gestionar');
  if p_bodega is null then raise exception 'Falta la bodega.'; end if;

  insert into public.produccion_aplicaciones (desde, hasta, bodega_id)
  values (p_desde, p_hasta, p_bodega) returning id into v_id;

  for v_l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_cant := (v_l->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then continue; end if;
    insert into public.movimientos_inventario
      (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values
      ((v_l->>'articulo_id')::uuid, p_bodega, p_hasta, 'produccion_consumo', -v_cant,
       'produccion_aplicacion', v_id, 'Producción ' || p_desde || ' a ' || p_hasta);
  end loop;

  return v_id;
end $$;
grant execute on function public.fn_aplicar_produccion(date, date, uuid, jsonb) to authenticated;

-- 5) ANULAR: revierte una aplicación metiendo entradas (ajuste_pos) al promedio
--    actual por cada consumo. Deja rastro (no borra). Idempotente por origen.
create or replace function public.fn_anular_aplicacion(p_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_estado text;
  r record;
begin
  perform public.fn_exigir_permiso('produccion.gestionar');
  select estado into v_estado from public.produccion_aplicaciones where id = p_id;
  if v_estado is null then raise exception 'Aplicación no encontrada.'; end if;
  if v_estado <> 'aplicada' then raise exception 'La aplicación ya está %.', v_estado; end if;

  for r in
    select articulo_id, bodega_id, cantidad
      from public.movimientos_inventario
     where origen_tipo = 'produccion_aplicacion' and origen_id = p_id and tipo = 'produccion_consumo'
  loop
    insert into public.movimientos_inventario
      (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values
      (r.articulo_id, r.bodega_id, (now() at time zone 'America/Costa_Rica')::date, 'ajuste_pos',
       -r.cantidad, 'produccion_aplicacion_anula', p_id, 'Reversa de producción');
  end loop;

  update public.produccion_aplicaciones set estado = 'anulada' where id = p_id;
end $$;
grant execute on function public.fn_anular_aplicacion(uuid) to authenticated;
