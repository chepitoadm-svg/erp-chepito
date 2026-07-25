-- =============================================================================
-- FIX: las transferencias no deben mover los totales GLOBALES del artículo.
--
-- Con promedio global, la mercadería en tránsito sigue siendo inventario de la
-- empresa. Si el envío bajara valor_total/existencia_total globales, durante el
-- tránsito el subledger de inventario quedaría por debajo de la cuenta contable
-- (que no se mueve, porque las transferencias no postean asiento) y la
-- conciliación inventario↔contabilidad se rompería.
--
-- Corrección: los movimientos de transferencia SOLO mueven la cantidad entre
-- bodegas (existencias); NO tocan articulos_saldos (existencia_total,
-- valor_total, costo_promedio). El global se mantiene constante:
--   existencia_total = sum(existencias por bodega) + en_tránsito.
--
-- Además: el índice de idempotencia del kardex rompía la recepción PARCIAL (dos
-- recepciones de la misma transferencia colisionaban). Se excluyen los tipos de
-- transferencia; la idempotencia del posteo se garantiza a nivel de documento.
-- =============================================================================

create or replace function public.fn_kardex_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_existe   numeric(18,4);
  v_valor    numeric(18,2);
  v_prom     numeric(18,4);
  v_bod      numeric(18,4);
  v_nuevo_ex numeric(18,4);
  v_valor_mov numeric(18,2);
  es_entrada boolean;
  trae_costo boolean;
  guarda_neg boolean;
  es_transfer boolean;
begin
  es_entrada  := new.tipo in
    ('saldo_inicial','compra','ajuste_pos','transferencia_recepcion',
     'produccion_entrada','devolucion_venta');
  trae_costo  := new.tipo in ('saldo_inicial','compra');
  guarda_neg  := new.tipo in ('ajuste_neg','transferencia_envio','devolucion_compra');
  es_transfer := new.tipo in ('transferencia_envio','transferencia_recepcion');

  -- Signo vs tipo.
  if es_entrada and new.cantidad <= 0 then
    raise exception 'El tipo % es una entrada: la cantidad debe ser positiva.', new.tipo;
  end if;
  if not es_entrada and new.cantidad >= 0 then
    raise exception 'El tipo % es una salida: la cantidad debe ser negativa.', new.tipo;
  end if;

  -- Serializar por artículo y leer el promedio actual.
  insert into public.articulos_saldos (articulo_id) values (new.articulo_id)
    on conflict (articulo_id) do nothing;
  select existencia_total, valor_total, costo_promedio
    into v_existe, v_valor, v_prom
    from public.articulos_saldos where articulo_id = new.articulo_id for update;

  -- Existencia de la bodega + candado de negativo.
  select cantidad into v_bod from public.existencias
   where articulo_id = new.articulo_id and bodega_id = new.bodega_id for update;
  v_bod := coalesce(v_bod, 0);
  if guarda_neg and (v_bod + new.cantidad) < 0 then
    raise exception
      'Existencia insuficiente: la bodega tiene % y la operación % saca %.',
      v_bod, new.tipo, abs(new.cantidad);
  end if;

  if es_transfer then
    -- Solo mueve cantidad entre bodegas. Los totales GLOBALES no cambian.
    new.costo_unitario     := v_prom;
    new.costo_total        := round(new.cantidad * v_prom, 2);
    new.existencia_despues := v_bod + new.cantidad;
    new.promedio_despues   := v_prom;
    -- NO se toca articulos_saldos.
  else
    v_nuevo_ex := v_existe + new.cantidad;

    if trae_costo then
      if new.costo_unitario is null then
        raise exception 'El tipo % exige costo_unitario.', new.tipo;
      end if;
      v_valor_mov := round(new.cantidad * new.costo_unitario, 2);
      v_valor     := v_valor + v_valor_mov;
    elsif es_entrada then
      v_valor_mov := round(new.cantidad * v_prom, 2);
      new.costo_unitario := v_prom;
      v_valor := v_valor + v_valor_mov;
    else
      if v_nuevo_ex = 0 then
        v_valor_mov := -v_valor;               -- última salida se lleva el residuo
      else
        v_valor_mov := -round(abs(new.cantidad) * v_prom, 2);
      end if;
      new.costo_unitario := v_prom;
      v_valor := v_valor + v_valor_mov;
    end if;

    v_prom := case when v_nuevo_ex > 0 then round(v_valor / v_nuevo_ex, 4) else 0 end;

    new.costo_total        := v_valor_mov;
    new.existencia_despues := v_bod + new.cantidad;
    new.promedio_despues   := v_prom;

    update public.articulos_saldos
       set existencia_total = v_nuevo_ex,
           valor_total      = v_valor,
           costo_promedio   = v_prom,
           actualizado_en   = now()
     where articulo_id = new.articulo_id;
  end if;

  -- La cantidad por bodega se mueve en TODOS los casos.
  insert into public.existencias (articulo_id, bodega_id, cantidad)
  values (new.articulo_id, new.bodega_id, new.cantidad)
  on conflict (articulo_id, bodega_id)
    do update set cantidad = public.existencias.cantidad + excluded.cantidad;

  return new;
end;
$$;

-- Idempotencia del kardex: excluye las transferencias (una transferencia genera
-- legítimamente varias recepciones parciales). La idempotencia de posteo se
-- garantiza a nivel de documento.
drop index if exists public.ux_mov_origen;
create unique index ux_mov_origen
  on public.movimientos_inventario (origen_tipo, origen_id, articulo_id, bodega_id, tipo)
  where origen_id is not null
    and tipo not in ('transferencia_envio','transferencia_recepcion');

do $$
begin
  raise notice 'Transferencias corregidas: no mueven los totales globales; recepción parcial ok.';
end $$;
