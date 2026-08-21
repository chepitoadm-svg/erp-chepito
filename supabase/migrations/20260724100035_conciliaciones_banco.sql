-- =============================================================================
-- Conciliación bancaria (Tesorería). Amarra los movimientos de libros de una
-- cuenta bancaria (asientos que la tocan) contra el estado de cuenta REAL del
-- banco, importado. No genera saldos: el saldo del banco viene del archivo.
--   conciliaciones_banco: cabecera (cuenta, fecha de corte, saldos del banco).
--   estado_cuenta_lineas: cada línea del banco (débito/crédito/balance) + el
--   movimiento de libros (asiento_linea) con el que casó.
-- Débito del banco = sale plata (↔ Haber en libros); Crédito = entra (↔ Debe).
-- =============================================================================

insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('tesoreria', 'conciliar', 'tesoreria.conciliar', 'Conciliar cuentas bancarias')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo = 'tesoreria.conciliar'
 where r.codigo in ('administrador','contador') on conflict do nothing;

create table public.conciliaciones_banco (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references public.cuentas(id),
  fecha_corte    date not null,
  saldo_inicial  numeric(18,2) not null default 0,
  saldo_final    numeric(18,2) not null default 0,
  estado         text not null default 'borrador' check (estado in ('borrador','conciliada','anulada')),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  conciliada_en  timestamptz, conciliada_por uuid,
  anulada_en     timestamptz, anulada_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create unique index conciliaciones_banco_unica
  on public.conciliaciones_banco (cuenta_id, fecha_corte) where estado <> 'anulada';
select public.fn_adjuntar_auditoria('public.conciliaciones_banco');
create trigger trg_concil_no_delete before delete on public.conciliaciones_banco
  for each row execute function public.fn_bloquear_delete();

create table public.estado_cuenta_lineas (
  id               uuid primary key default gen_random_uuid(),
  conciliacion_id  uuid not null references public.conciliaciones_banco(id) on delete cascade,
  orden            int not null default 0,
  fecha            date not null,
  referencia       text,
  codigo           text,
  descripcion      text,
  debito           numeric(18,2) not null default 0,
  credito          numeric(18,2) not null default 0,
  balance          numeric(18,2),
  asiento_linea_id uuid references public.asientos_lineas(id),
  estado           text not null default 'pendiente' check (estado in ('pendiente','conciliada'))
);
-- Un movimiento de libros solo puede casar con UNA línea del banco (en conciliaciones vivas).
create unique index estado_cuenta_asiento_linea_unica
  on public.estado_cuenta_lineas (asiento_linea_id) where asiento_linea_id is not null;

-- === ALTA (recibe las líneas ya parseadas del .xls) =========================
create or replace function public.fn_crear_conciliacion(
  p_cuenta uuid, p_fecha_corte date, p_saldo_inicial numeric, p_saldo_final numeric, p_lineas jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; r jsonb; v_i int := 0;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select codigo into v_cod from public.cuentas where id = p_cuenta and acepta_movimiento and estado='activo';
  if v_cod is null then raise exception 'Cuenta bancaria inválida.'; end if;
  if p_fecha_corte is null then raise exception 'Falta la fecha de corte.'; end if;

  insert into public.conciliaciones_banco (cuenta_id, fecha_corte, saldo_inicial, saldo_final)
  values (p_cuenta, p_fecha_corte, round(coalesce(p_saldo_inicial,0),2), round(coalesce(p_saldo_final,0),2))
  returning id into v_id;

  if jsonb_typeof(p_lineas) = 'array' then
    for r in select * from jsonb_array_elements(p_lineas) loop
      v_i := v_i + 1;
      insert into public.estado_cuenta_lineas
        (conciliacion_id, orden, fecha, referencia, codigo, descripcion, debito, credito, balance)
      values (v_id, v_i, (r->>'fecha')::date, nullif(r->>'referencia',''), nullif(r->>'codigo',''),
              nullif(r->>'descripcion',''), round(coalesce((r->>'debito')::numeric,0),2),
              round(coalesce((r->>'credito')::numeric,0),2),
              nullif(r->>'balance','')::numeric);
    end loop;
  end if;
  return v_id;
end $$;
grant execute on function public.fn_crear_conciliacion(uuid, date, numeric, numeric, jsonb) to authenticated;

-- === EMPAREJAR una línea del banco con un movimiento de libros ==============
create or replace function public.fn_conciliar_linea(p_linea uuid, p_asiento_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_conc uuid; v_estado text; v_cuenta uuid; v_deb numeric; v_cre numeric;
        v_al_cuenta uuid; v_al_deb numeric; v_al_cre numeric; v_al_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select ecl.conciliacion_id, cb.estado, cb.cuenta_id, ecl.debito, ecl.credito
    into v_conc, v_estado, v_cuenta, v_deb, v_cre
    from public.estado_cuenta_lineas ecl join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_linea;
  if v_conc is null then raise exception 'Línea del banco inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  select l.cuenta_id, l.debito, l.credito, a.estado
    into v_al_cuenta, v_al_deb, v_al_cre, v_al_estado
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
   where l.id = p_asiento_linea;
  if v_al_cuenta is null then raise exception 'Movimiento de libros inexistente.'; end if;
  if v_al_estado <> 'confirmado' then raise exception 'El movimiento de libros no está confirmado.'; end if;
  if v_al_cuenta <> v_cuenta then raise exception 'El movimiento no es de la misma cuenta bancaria.'; end if;
  -- Débito del banco (sale) ↔ Haber en libros; Crédito del banco (entra) ↔ Debe.
  if round(v_deb,2) <> round(v_al_cre,2) or round(v_cre,2) <> round(v_al_deb,2) then
    raise exception 'El monto no calza: banco (D %, C %) vs libros (D %, C %).', v_deb, v_cre, v_al_deb, v_al_cre;
  end if;

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = p_linea;
end $$;
grant execute on function public.fn_conciliar_linea(uuid, uuid) to authenticated;

create or replace function public.fn_desconciliar_linea(p_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select cb.estado into v_estado from public.estado_cuenta_lineas ecl
    join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id where ecl.id = p_linea;
  if v_estado is null then raise exception 'Línea inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;
  update public.estado_cuenta_lineas set asiento_linea_id = null, estado = 'pendiente' where id = p_linea;
end $$;
grant execute on function public.fn_desconciliar_linea(uuid) to authenticated;

create or replace function public.fn_marcar_conciliada(p_conciliacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.conciliaciones_banco where id = p_conciliacion;
  if v_estado is null then raise exception 'Conciliación inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;
  update public.conciliaciones_banco set estado='conciliada', conciliada_en=now(), conciliada_por=auth.uid()
   where id = p_conciliacion;
end $$;
grant execute on function public.fn_marcar_conciliada(uuid) to authenticated;

create or replace function public.fn_anular_conciliacion(p_conciliacion uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.conciliaciones_banco where id = p_conciliacion;
  if v_estado is null then raise exception 'Conciliación inexistente.'; end if;
  if v_estado = 'anulada' then raise exception 'Ya está anulada.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  -- libera los matches (las líneas quedan pendientes) y marca anulada
  update public.estado_cuenta_lineas set asiento_linea_id = null, estado='pendiente' where conciliacion_id = p_conciliacion;
  update public.conciliaciones_banco set estado='anulada', anulada_en=now(), anulada_por=auth.uid() where id = p_conciliacion;
end $$;
grant execute on function public.fn_anular_conciliacion(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.conciliaciones_banco enable row level security;
alter table public.estado_cuenta_lineas enable row level security;
create policy concil_sel on public.conciliaciones_banco for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('tesoreria.conciliar'));
create policy concil_wr on public.conciliaciones_banco for all to authenticated
  using (public.tengo_permiso('tesoreria.conciliar')) with check (public.tengo_permiso('tesoreria.conciliar'));
create policy ecl_sel on public.estado_cuenta_lineas for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('tesoreria.conciliar'));
create policy ecl_wr on public.estado_cuenta_lineas for all to authenticated
  using (public.tengo_permiso('tesoreria.conciliar')) with check (public.tengo_permiso('tesoreria.conciliar'));

do $$ begin raise notice 'conciliaciones_banco listo.'; end $$;
