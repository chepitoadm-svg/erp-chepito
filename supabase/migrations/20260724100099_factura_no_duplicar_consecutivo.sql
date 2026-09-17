-- =============================================================================
-- Evitar facturas de compra DUPLICADAS por consecutivo. El índice único solo
-- cubría la clave EXACTA, pero la misma factura puede entrar con la clave de 50
-- dígitos (correo) y con solo el consecutivo de 20 (Excel / a mano) → no calzaban
-- y se duplicaba. Ahora se deduplica por el CONSECUTIVO (20 dígitos), que va
-- embebido en la clave, sin importar por dónde entre.
-- =============================================================================

-- Consecutivo (20 dígitos) de una clave: si trae los 50 dígitos, se extrae
-- (posiciones 22..41); si ya son 20, es el consecutivo; si no, null.
create or replace function public.fn_consecutivo(p_clave text)
returns text language sql immutable as $$
  select case
    when p_clave is null then null
    when length(regexp_replace(p_clave, '\D', '', 'g')) = 50
      then substring(regexp_replace(p_clave, '\D', '', 'g') from 22 for 20)
    when length(regexp_replace(p_clave, '\D', '', 'g')) = 20
      then regexp_replace(p_clave, '\D', '', 'g')
    else null
  end;
$$;

-- Antes de insertar/actualizar una factura viva, rechazar si ya hay otra (no
-- anulada) con el mismo consecutivo. SECURITY DEFINER para ver todas las
-- sucursales (el duplicado puede estar en otra).
create or replace function public.fn_factura_no_dup_consecutivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cons text; v_otra text;
begin
  if new.estado = 'anulada' then return new; end if;
  v_cons := public.fn_consecutivo(new.clave);
  if v_cons is null then return new; end if; -- sin consecutivo válido: no se puede deduplicar

  select clave into v_otra
    from public.facturas_compra
   where id <> new.id and estado <> 'anulada' and public.fn_consecutivo(clave) = v_cons
   limit 1;
  if v_otra is not null then
    raise exception 'Ya existe una factura con el consecutivo % (otra: %). No se puede duplicar; si es la misma, anulá una.', v_cons, v_otra;
  end if;
  return new;
end $$;

drop trigger if exists trg_factura_no_dup_consecutivo on public.facturas_compra;
create trigger trg_factura_no_dup_consecutivo
  before insert or update of clave, estado on public.facturas_compra
  for each row execute function public.fn_factura_no_dup_consecutivo();

do $$ begin raise notice 'Candado anti-duplicado por consecutivo listo.'; end $$;
