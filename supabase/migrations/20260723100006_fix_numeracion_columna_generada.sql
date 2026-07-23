-- =============================================================================
-- FIX: la numeración fallaba con
--   "null value in column anio of relation asientos_consecutivos".
--
-- Causa: asientos.anio es GENERATED ALWAYS ... STORED, y PostgreSQL calcula las
-- columnas generadas DESPUÉS de ejecutar los triggers BEFORE. Dentro de
-- fn_asiento_numerar (BEFORE UPDATE), NEW.anio todavía es NULL.
--
-- Arreglo: derivar el año de NEW.fecha, que sí está disponible. La columna
-- generada se mantiene (sirve para el índice único y las consultas); solo se
-- deja de leer desde un trigger BEFORE.
-- =============================================================================

create or replace function public.fn_asiento_numerar()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'confirmado' and old.estado = 'borrador' and new.numero is null then
    -- NO usar new.anio: es columna generada y en un trigger BEFORE llega NULL.
    new.numero := public.fn_siguiente_numero_asiento(
      new.tipo,
      extract(year from new.fecha)::int
    );
  end if;
  return new;
end;
$$;

do $$
begin
  raise notice 'Numeración corregida: el año se deriva de fecha, no de la columna generada.';
end $$;
