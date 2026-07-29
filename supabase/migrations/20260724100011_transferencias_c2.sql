-- =============================================================================
-- Fase 3 — Migración 10 (C2): alta atómica y anulación de transferencias.
--
-- Ya existían fn_enviar_transferencia y fn_recibir_transferencia (mig 4). Faltan
-- dos piezas para que el módulo quede completo:
--
-- (a) fn_crear_transferencia: cabecera borrador + líneas en UNA transacción
--     (transferencias tiene trg_transf_no_delete: anular, nunca borrar → no se
--     pueden dejar borradores huérfanos). Permiso inventario.transferir; origen
--     y destino deben ser visibles para el usuario y distintos entre sí.
--
-- (b) fn_anular_transferencia:
--       - borrador   → solo marca anulada (nada salió de bodega).
--       - en_transito → reversa lo que sigue pendiente (enviado - recibido) de
--         vuelta al origen y marca anulada. Lo ya recibido se queda donde entró.
--     Las transferencias NO postean asiento, así que anular tampoco.
-- =============================================================================

create or replace function public.fn_crear_transferencia(
  p_origen  uuid,
  p_destino uuid,
  p_glosa   text,
  p_lineas  jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  r    jsonb;
  i    int := 0;
begin
  perform public.fn_exigir_permiso('inventario.transferir');

  if p_origen = p_destino then
    raise exception 'El origen y el destino deben ser distintos.';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La transferencia no tiene líneas.';
  end if;
  if auth.uid() is not null and not public.soy_administrador() then
    if p_origen not in (select b from public.fn_bodegas_visibles() b) then
      raise exception 'No podés transferir desde esa bodega.';
    end if;
    if p_destino not in (select b from public.fn_bodegas_visibles() b) then
      raise exception 'No podés transferir hacia esa bodega.';
    end if;
  end if;

  insert into public.transferencias (bodega_origen_id, bodega_destino_id, glosa)
  values (p_origen, p_destino, nullif(btrim(coalesce(p_glosa, '')), ''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    insert into public.transferencias_lineas
      (transferencia_id, linea, articulo_id, cantidad_enviada, detalle)
    values (v_id, i,
            (r->>'articulo_id')::uuid,
            (r->>'cantidad')::numeric,
            nullif(btrim(coalesce(r->>'detalle', '')), ''));
  end loop;

  return v_id;
end $$;

grant execute on function public.fn_crear_transferencia(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.fn_anular_transferencia(p_transf uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_origen uuid; r record; v_pend numeric(18,4);
begin
  perform public.fn_exigir_permiso('inventario.transferir');
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'La anulación exige un motivo.';
  end if;

  select estado, fecha, bodega_origen_id into v_estado, v_fecha, v_origen
    from public.transferencias where id = p_transf;
  if v_estado is null then raise exception 'Transferencia inexistente.'; end if;
  if v_estado not in ('borrador', 'en_transito') then
    raise exception 'Solo se anula una transferencia en borrador o en tránsito (está %).', v_estado;
  end if;

  -- Si ya se había enviado, devuelve lo pendiente al origen.
  if v_estado = 'en_transito' then
    for r in select * from public.transferencias_lineas where transferencia_id = p_transf order by linea
    loop
      v_pend := r.cantidad_enviada - r.cantidad_recibida;
      if v_pend > 0 then
        -- El retorno es una ENTRADA al origen (transferencia_recepcion, positiva):
        -- el motor exige que transferencia_envio sea negativa.
        insert into public.movimientos_inventario
          (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
        values (r.articulo_id, v_origen, v_fecha, 'transferencia_recepcion', v_pend,
                'transferencia_anulacion', p_transf, 'Retorno al origen por anulación');
      end if;
    end loop;
  end if;

  update public.transferencias
     set estado='anulada', anulada_en=now(), anulada_por=auth.uid()
   where id = p_transf;
end $$;

grant execute on function public.fn_anular_transferencia(uuid, text) to authenticated;

do $$
begin
  raise notice 'C2 lista: fn_crear_transferencia(...) y fn_anular_transferencia(...).';
end $$;
