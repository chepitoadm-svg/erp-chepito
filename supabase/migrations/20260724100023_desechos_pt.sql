-- =============================================================================
-- Desechos de producto terminado (pan dañado o vencido en Chepito 1 y 2).
--
-- El PT no lleva kardex (conteo físico mensual). El desecho se registra
-- VALORIZADO con costo estimado del costeador para verlo por centro en el
-- Estado de Resultados. Es una RECLASIFICACIÓN: el costo ya está en el P&L vía
-- el método periódico / prorrateo del Taller, así que NO se dobla — solo se
-- separa como línea propia.
--
-- Al confirmar postea, por el valor estimado:
--   Debe 51-30-01-02 Costo por mercadería dañada (centro)
--   Haber 51-10-02   Compras gravadas               (centro)
-- Neto en la utilidad del centro = 0; el desecho queda visible aparte.
-- No mueve inventario (el PT no tiene kardex).
-- =============================================================================

create table public.desechos_pt (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  centro_costo_id uuid not null references public.centros_costo(id),
  motivo         text not null default 'danado' check (motivo in ('danado','vencido','otro')),
  glosa          text,
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  valor_total    numeric(18,2) not null default 0,
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz, confirmado_por uuid,
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.desechos_pt_lineas (
  id             uuid primary key default gen_random_uuid(),
  desecho_id     uuid not null references public.desechos_pt(id) on delete cascade,
  linea          int not null,
  descripcion    text not null,                                   -- producto (texto libre, no hay catálogo de PT)
  cantidad       numeric(18,4) not null check (cantidad > 0),
  costo_unitario numeric(18,4) not null check (costo_unitario >= 0),  -- estimado, del costeador
  valor          numeric(18,2) not null default 0,                -- cantidad * costo
  unique (desecho_id, linea)
);
select public.fn_adjuntar_auditoria('public.desechos_pt');

create trigger trg_desecho_no_delete before delete on public.desechos_pt
  for each row execute function public.fn_bloquear_delete();

-- === ALTA ATÓMICA ===========================================================
create or replace function public.fn_crear_desecho(
  p_centro uuid,
  p_fecha  date,
  p_motivo text,
  p_glosa  text,
  p_lineas jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; r jsonb; i int := 0;
  v_cant numeric(18,4); v_costo numeric(18,4); v_val numeric(18,2); v_total numeric(18,2) := 0;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'El desecho exige un centro de venta (Chepito 1 o 2).'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El desecho no tiene líneas.'; end if;

  insert into public.desechos_pt (fecha, centro_costo_id, motivo, glosa)
  values (coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date),
          p_centro, coalesce(nullif(btrim(coalesce(p_motivo,'')),''), 'danado'),
          nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_cant := (r->>'cantidad')::numeric;
    v_costo := (r->>'costo_unitario')::numeric;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida en la línea %.', i; end if;
    if v_costo is null or v_costo < 0 then raise exception 'Costo inválido en la línea %.', i; end if;
    v_val := round(v_cant * v_costo, 2);
    insert into public.desechos_pt_lineas (desecho_id, linea, descripcion, cantidad, costo_unitario, valor)
    values (v_id, i, nullif(btrim(coalesce(r->>'descripcion','')),''), v_cant, v_costo, v_val);
    v_total := v_total + v_val;
  end loop;

  update public.desechos_pt set valor_total = v_total where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_desecho(uuid, date, text, text, jsonb) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_desecho(p_desecho uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_centro uuid; v_total numeric(18,2);
  v_cta_des uuid; v_cta_com uuid; v_lineas jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado, fecha, centro_costo_id, valor_total
    into v_estado, v_fecha, v_centro, v_total
    from public.desechos_pt where id = p_desecho;
  if v_estado is null then raise exception 'Desecho inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El desecho ya está %.', v_estado; end if;
  if v_total <= 0 then raise exception 'El desecho no tiene valor.'; end if;

  select id into v_cta_des from public.cuentas where codigo = '51-30-01-02-00';
  select id into v_cta_com from public.cuentas where codigo = '51-10-02-00-00';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_des, 'debito',  v_total, 'centro_costo_id', v_centro, 'detalle','Desecho de producto terminado'),
    jsonb_build_object('cuenta_id', v_cta_com, 'credito', v_total, 'centro_costo_id', v_centro, 'detalle','Reclasificación de compras a desecho'));
  v_asiento := public.fn_postear_asiento('diario', v_fecha, 'Desecho de producto terminado', 'desecho_pt', p_desecho, v_lineas);

  update public.desechos_pt set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_desecho;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_desecho(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_desecho(p_desecho uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado into v_estado from public.desechos_pt where id = p_desecho;
  if v_estado is null then raise exception 'Desecho inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un desecho confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;

  perform public.fn_anular_asiento_auto('desecho_pt', p_desecho, p_motivo);
  update public.desechos_pt set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_desecho;
end $$;
grant execute on function public.fn_anular_desecho(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.desechos_pt        enable row level security;
alter table public.desechos_pt_lineas  enable row level security;
create policy desecho_sel on public.desechos_pt for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('inventario.ver'));
create policy desecho_wr on public.desechos_pt for all to authenticated
  using (public.tengo_permiso('inventario.ajustar')) with check (public.tengo_permiso('inventario.ajustar'));
create policy desechol_all on public.desechos_pt_lineas for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('inventario.ver')) with check (public.tengo_permiso('inventario.ajustar'));

do $$ begin raise notice 'Desechos de PT listo.'; end $$;
