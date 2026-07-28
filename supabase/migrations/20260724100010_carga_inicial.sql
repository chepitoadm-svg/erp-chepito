-- =============================================================================
-- Fase 3 — Migración 9 (C1): carga inicial de existencias + alta atómica de
-- ajustes.
--
-- (a) fn_cargar_saldo_inicial: el movimiento `saldo_inicial` ingresa
--     cantidad + costo al kardex SIN postear asiento (el valor ya vive en el
--     asiento de apertura del 30/06). Los writes al kardex están bloqueados por
--     RLS a las funciones SECURITY DEFINER, así que la app entra por esta
--     puerta, con permiso `inventario.ajustar` y solo a bodegas visibles.
--     Conciliación: fn_conciliar_inventario_inicial() = 0 → cuadra contra 11-60.
--
-- (b) fn_crear_ajuste: crea el ajuste (cabecera borrador + líneas) en UNA sola
--     transacción, igual que app_crear_asiento. Evita borradores huérfanos
--     (ajustes_inventario tiene trg_ajustes_no_delete: anular, nunca borrar).
-- =============================================================================

create or replace function public.fn_cargar_saldo_inicial(
  p_articulo       uuid,
  p_bodega         uuid,
  p_cantidad       numeric,
  p_costo_unitario numeric,
  p_fecha          date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_fecha date;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad inicial debe ser mayor que cero.';
  end if;
  if p_costo_unitario is null or p_costo_unitario < 0 then
    raise exception 'El costo unitario no puede ser negativo.';
  end if;
  if not exists (select 1 from public.articulos where id = p_articulo and estado = 'activo') then
    raise exception 'El artículo no existe o está inactivo.';
  end if;

  -- Solo a bodegas que el usuario puede ver (el admin ve todas). Igual que
  -- fn_exigir_permiso, solo se aplica cuando hay un usuario real (auth.uid);
  -- un contexto de servicio/superusuario no queda atrapado.
  if auth.uid() is not null
     and not public.soy_administrador()
     and p_bodega not in (select b from public.fn_bodegas_visibles() b) then
    raise exception 'No podés cargar existencias en esa bodega.';
  end if;

  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date);

  insert into public.movimientos_inventario
    (articulo_id, bodega_id, fecha, tipo, cantidad, costo_unitario, detalle)
  values (p_articulo, p_bodega, v_fecha, 'saldo_inicial', p_cantidad, p_costo_unitario,
          'Carga inicial de existencias')
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.fn_cargar_saldo_inicial(uuid, uuid, numeric, numeric, date) to authenticated;

-- (b) Alta atómica de un ajuste (cabecera borrador + líneas).
create or replace function public.fn_crear_ajuste(
  p_bodega uuid,
  p_fecha  date,
  p_motivo text,
  p_lineas jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  r    jsonb;
  i    int := 0;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'El ajuste exige un motivo.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El ajuste no tiene líneas.';
  end if;
  if auth.uid() is not null
     and not public.soy_administrador()
     and p_bodega not in (select b from public.fn_bodegas_visibles() b) then
    raise exception 'No podés ajustar esa bodega.';
  end if;

  insert into public.ajustes_inventario (bodega_id, fecha, motivo)
  values (p_bodega,
          coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date),
          btrim(p_motivo))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    -- direccion (pos/neg) y cantidad (>0) los valida el CHECK de la tabla.
    insert into public.ajustes_inventario_lineas
      (ajuste_id, linea, articulo_id, direccion, cantidad, detalle)
    values (v_id, i,
            (r->>'articulo_id')::uuid,
            r->>'direccion',
            (r->>'cantidad')::numeric,
            nullif(btrim(coalesce(r->>'detalle','')), ''));
  end loop;

  return v_id;
end $$;

grant execute on function public.fn_crear_ajuste(uuid, date, text, jsonb) to authenticated;

do $$
begin
  raise notice 'C1 lista: fn_cargar_saldo_inicial(...) y fn_crear_ajuste(...).';
end $$;
