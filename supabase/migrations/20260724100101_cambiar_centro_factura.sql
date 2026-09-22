-- =============================================================================
-- Cambiar el CENTRO DE COSTO de una factura de gasto, incluso ya confirmada.
--
-- El centro de costo es una dimensión de ANÁLISIS (a qué sucursal/canal se carga
-- el gasto en el Estado de Resultados), no un importe contable. Corregirlo NO
-- altera los montos ni las cuentas del asiento, así que la fiabilidad legal del
-- Diario/Mayor (los importes) se mantiene intacta. Antes esto obligaba a anular
-- por reversión; ahora se permite el ajuste puntual, con rastro en `auditoria`.
--
-- Se implementa en dos partes:
--   1. El trigger de inmutabilidad de líneas deja pasar un UPDATE en un asiento
--      posteado SOLO si lo único que cambia es `centro_costo_id` (mismos importes,
--      misma cuenta, mismo asiento). Cualquier cambio de monto/cuenta sigue
--      prohibido.
--   2. fn_cambiar_centro_factura actualiza la factura y, si ya tiene asiento, el
--      centro de sus líneas de resultado.
-- =============================================================================

-- 1) Excepción acotada en la inmutabilidad de líneas.
create or replace function public.fn_lineas_solo_en_borrador()
returns trigger
language plpgsql
as $$
declare v_id uuid; v_estado text;
begin
  v_id := case when tg_op = 'DELETE' then old.asiento_id else new.asiento_id end;
  select estado into v_estado from public.asientos where id = v_id;

  -- Si el asiento ya no existe (borrado en cascada, imposible hoy) no bloquea.
  if v_estado is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_estado <> 'borrador' then
    -- Excepción: en un asiento posteado se permite corregir SOLO el centro de
    -- costo (dimensión de análisis). Los importes y la cuenta son inmutables.
    if tg_op = 'UPDATE'
       and new.asiento_id     is not distinct from old.asiento_id
       and new.cuenta_id      is not distinct from old.cuenta_id
       and new.debito         is not distinct from old.debito
       and new.credito        is not distinct from old.credito
       and new.monto_original is not distinct from old.monto_original
       and new.moneda         is not distinct from old.moneda
       and new.tipo_cambio    is not distinct from old.tipo_cambio
       and new.centro_costo_id is distinct from old.centro_costo_id then
      return new;
    end if;
    raise exception
      'El asiento está % : sus líneas son inmutables. Corregir = anular por reversión.',
      v_estado;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 2) Cambiar el centro de una factura de gasto (borrador o confirmada).
create or replace function public.fn_cambiar_centro_factura(
  p_factura uuid,
  p_centro  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo    text;
  v_asiento uuid;
  v_activo  boolean;
begin
  select tipo, asiento_id into v_tipo, v_asiento
    from public.facturas_compra where id = p_factura;
  if not found then
    raise exception 'Factura inexistente.';
  end if;
  if v_tipo <> 'gasto' then
    raise exception 'Solo las facturas de gasto llevan centro de costo.';
  end if;

  select activo into v_activo from public.centros_costo where id = p_centro;
  if not coalesce(v_activo, false) then
    raise exception 'El centro de costo no existe o está inactivo.';
  end if;

  update public.facturas_compra
     set centro_costo_id = p_centro
   where id = p_factura;

  -- Si ya está posteada, corrige el centro en las líneas de resultado del
  -- asiento (las de balance —CxP, IVA— tienen centro NULL y no se tocan).
  if v_asiento is not null then
    update public.asientos_lineas
       set centro_costo_id = p_centro
     where asiento_id = v_asiento
       and centro_costo_id is not null;
  end if;
end;
$$;

revoke all on function public.fn_cambiar_centro_factura(uuid, uuid) from public, anon;
grant execute on function public.fn_cambiar_centro_factura(uuid, uuid) to authenticated;

do $$ begin raise notice 'fn_cambiar_centro_factura lista; centro editable en gasto sin tocar importes.'; end $$;
