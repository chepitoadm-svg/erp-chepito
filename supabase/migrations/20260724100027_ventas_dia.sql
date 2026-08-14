-- =============================================================================
-- Ventas del día por panadería (Fase C, paso 1: INGRESO).
-- Por cada negocio (CH1/CH2) y fecha se registra lo vendido (gravado, exento,
-- IVA) — a mano por ahora; luego se jala de QuPOS. Al confirmar postea:
--   Debe  11-10-10-01 Caja general              (total cobrado)
--   Haber 41-10-02 Ventas gravadas   (centro)   [neto gravado]
--   Haber 41-10-01 Ventas exentas    (centro)   [neto exento]
--   Haber 21-10-15-04 Impuesto de ventas cobrado [IVA]
-- Da el renglón de VENTAS por panadería en el Estado de Resultados.
-- El COSTO de ventas (margen) es un paso posterior (costeo del PT + QuPOS).
-- =============================================================================

insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('ventas', 'registrar', 'ventas.registrar', 'Registrar y anular ventas del día')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r join public.permisos p on p.codigo = 'ventas.registrar'
 where r.codigo in ('administrador','contador') on conflict do nothing;

create table public.ventas_dia (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null,
  centro_costo_id uuid not null references public.centros_costo(id),
  gravado        numeric(18,2) not null default 0 check (gravado >= 0),
  exento         numeric(18,2) not null default 0 check (exento  >= 0),
  iva            numeric(18,2) not null default 0 check (iva     >= 0),
  total          numeric(18,2) not null default 0,
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  asiento_id     uuid references public.asientos(id),
  glosa          text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz, confirmado_por uuid,
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
-- Una venta por (día, negocio) que no esté anulada.
create unique index ventas_dia_unica on public.ventas_dia (fecha, centro_costo_id) where estado <> 'anulado';
select public.fn_adjuntar_auditoria('public.ventas_dia');
create trigger trg_venta_dia_no_delete before delete on public.ventas_dia
  for each row execute function public.fn_bloquear_delete();

-- === ALTA ===================================================================
create or replace function public.fn_crear_venta_dia(
  p_centro uuid, p_fecha date, p_gravado numeric, p_exento numeric, p_iva numeric, p_glosa text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric(18,2);
begin
  perform public.fn_exigir_permiso('ventas.registrar');
  if not exists (select 1 from public.centros_costo where id = p_centro and activo and tipo = 'final') then
    raise exception 'La venta exige un negocio (Chepito 1 o 2).'; end if;
  v_total := round(coalesce(p_gravado,0),2) + round(coalesce(p_exento,0),2) + round(coalesce(p_iva,0),2);
  if v_total <= 0 then raise exception 'La venta no tiene monto.'; end if;

  insert into public.ventas_dia (fecha, centro_costo_id, gravado, exento, iva, total, glosa)
  values (coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date), p_centro,
          round(coalesce(p_gravado,0),2), round(coalesce(p_exento,0),2), round(coalesce(p_iva,0),2),
          v_total, nullif(btrim(coalesce(p_glosa,'')),''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_venta_dia(uuid, date, numeric, numeric, numeric, text) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_venta_dia(p_venta uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_centro uuid;
  v_grav numeric(18,2); v_exen numeric(18,2); v_iva numeric(18,2); v_total numeric(18,2);
  v_cta_caja uuid; v_cta_vg uuid; v_cta_ve uuid; v_cta_iva uuid;
  v_lineas jsonb := '[]'::jsonb; v_asiento uuid;
begin
  perform public.fn_exigir_permiso('ventas.registrar');
  select estado, fecha, centro_costo_id, gravado, exento, iva, total
    into v_estado, v_fecha, v_centro, v_grav, v_exen, v_iva, v_total
    from public.ventas_dia where id = p_venta;
  if v_estado is null then raise exception 'Venta inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La venta ya está %.', v_estado; end if;

  select id into v_cta_caja from public.cuentas where codigo = '11-10-10-01-00';
  select id into v_cta_vg   from public.cuentas where codigo = '41-10-02-00-00';
  select id into v_cta_ve   from public.cuentas where codigo = '41-10-01-00-00';
  select id into v_cta_iva  from public.cuentas where codigo = '21-10-15-04-00';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_cta_caja, 'debito', v_total, 'detalle','Ventas del día'));
  if v_grav > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_vg, 'credito', v_grav, 'centro_costo_id', v_centro, 'detalle','Ventas gravadas'); end if;
  if v_exen > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_ve, 'credito', v_exen, 'centro_costo_id', v_centro, 'detalle','Ventas exentas'); end if;
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cta_iva, 'credito', v_iva, 'detalle','IVA cobrado'); end if;

  v_asiento := public.fn_postear_asiento('ingreso', v_fecha, 'Ventas del día', 'venta_dia', p_venta, v_lineas);

  update public.ventas_dia set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid()
   where id = p_venta;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_venta_dia(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_venta_dia(p_venta uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.fn_exigir_permiso('ventas.registrar');
  select estado into v_estado from public.ventas_dia where id = p_venta;
  if v_estado is null then raise exception 'Venta inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula una venta confirmada (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;
  perform public.fn_anular_asiento_auto('venta_dia', p_venta, p_motivo);
  update public.ventas_dia set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_venta;
end $$;
grant execute on function public.fn_anular_venta_dia(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.ventas_dia enable row level security;
create policy ventas_dia_sel on public.ventas_dia for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('ventas.registrar'));
create policy ventas_dia_wr on public.ventas_dia for all to authenticated
  using (public.tengo_permiso('ventas.registrar')) with check (public.tengo_permiso('ventas.registrar'));

do $$ begin raise notice 'ventas_dia listo.'; end $$;
