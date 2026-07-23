-- =============================================================================
-- Consecutivo de asientos por (tipo, año).
--
-- Tabla contador con bloqueo de fila, NO una SEQUENCE. Razón: una SEQUENCE no
-- revierte en un rollback, así que deja huecos en la numeración, y los huecos
-- en un libro contable son exactamente lo que un auditor pregunta. Con la
-- tabla, el incremento vive dentro de la transacción: si la confirmación
-- revienta, el número se libera.
--
-- Costo aceptado: dos confirmaciones simultáneas del mismo (tipo, año) se
-- serializan. Es el precio de no tener huecos, y el volumen no lo justifica al
-- revés.
-- =============================================================================

create table public.asientos_consecutivos (
  tipo          text not null,
  anio          int  not null,
  ultimo_numero int  not null default 0 check (ultimo_numero >= 0),
  primary key (tipo, anio)
);

comment on table public.asientos_consecutivos is
  'Contador por tipo y año. Con bloqueo de fila para no dejar huecos.';

create or replace function public.fn_siguiente_numero_asiento(p_tipo text, p_anio int)
returns int
language plpgsql
as $$
declare v_numero int;
begin
  -- Asegura la fila del contador sin pisar la existente.
  insert into public.asientos_consecutivos (tipo, anio, ultimo_numero)
  values (p_tipo, p_anio, 0)
  on conflict (tipo, anio) do nothing;

  -- El UPDATE toma el bloqueo de la fila: cualquier otra transacción que quiera
  -- numerar el mismo (tipo, año) espera acá. Al revertir, el número se libera.
  update public.asientos_consecutivos
     set ultimo_numero = ultimo_numero + 1
   where tipo = p_tipo and anio = p_anio
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

-- === ENGANCHE CON LA CONFIRMACIÓN ===========================================
-- El número se asigna AL CONFIRMAR. Un borrador descartado no consume número.
-- Dispara después de trg_asiento_before_update (orden alfabético), o sea que
-- para cuando llega acá la transición ya fue validada.
create or replace function public.fn_asiento_numerar()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'confirmado' and old.estado = 'borrador' and new.numero is null then
    new.numero := public.fn_siguiente_numero_asiento(new.tipo, new.anio);
  end if;
  return new;
end;
$$;

create trigger trg_asiento_numerar
  before update on public.asientos
  for each row execute function public.fn_asiento_numerar();

do $$
begin
  raise notice 'Consecutivo listo: numeración por (tipo, año) sin huecos.';
end $$;
