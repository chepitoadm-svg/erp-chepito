-- =============================================================================
-- Cierre mensual del método periódico (por conteo físico, por artículo).
--
-- Durante el mes las compras van a costo (Compras). A fin de mes, el conteo
-- físico devuelve a Inventario lo NO consumido, ajustando el costo del mes:
--   Costo del mes = Inventario inicial + Compras − Inventario final (físico).
--
-- Por bodega, con su centro:
--   valor final SUBE vs el cierre anterior → Debe Inventario / Haber 51-10-03 (centro)
--   valor final BAJA                        → Debe 51-10-03 (centro) / Haber Inventario
-- El robo/faltante (teórico > físico) cae solo en el costo. Además el kardex se
-- ajusta al conteo físico (raw, sin asiento) para arrancar limpio el mes siguiente.
-- Se corre ANTES del prorrateo del Taller.
-- =============================================================================

create table public.cierres_inventario (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Costa_Rica')::date,
  bodega_id      uuid not null references public.bodegas(id),
  centro_costo_id uuid references public.centros_costo(id),
  estado         text not null default 'borrador' check (estado in ('borrador','confirmado','anulado')),
  valor_teorico  numeric(18,2) not null default 0,
  valor_fisico   numeric(18,2) not null default 0,
  diferencia     numeric(18,2) not null default 0,   -- físico − teórico (faltante si negativo)
  asiento_id     uuid references public.asientos(id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  confirmado_en  timestamptz, confirmado_por uuid,
  anulado_en     timestamptz, anulado_por uuid,
  actualizado_en timestamptz, actualizado_por uuid
);
create table public.cierres_inventario_lineas (
  id                uuid primary key default gen_random_uuid(),
  cierre_id         uuid not null references public.cierres_inventario(id) on delete cascade,
  linea             int not null,
  articulo_id       uuid not null references public.articulos(id),
  cantidad_teorica  numeric(18,4) not null default 0,
  cantidad_fisica   numeric(18,4) not null default 0,
  costo_promedio    numeric(18,4) not null default 0,
  valor_teorico     numeric(18,2) not null default 0,
  valor_fisico      numeric(18,2) not null default 0,
  unique (cierre_id, linea)
);
select public.fn_adjuntar_auditoria('public.cierres_inventario');

create trigger trg_cierre_no_delete before delete on public.cierres_inventario
  for each row execute function public.fn_bloquear_delete();

-- Nuevo tipo de kardex para el ajuste por cierre (mueve cantidad, sin asiento).
alter table public.movimientos_inventario drop constraint if exists movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo = any (array['saldo_inicial','compra','ajuste_pos','ajuste_neg','ajuste_valor',
    'transferencia_envio','transferencia_recepcion','devolucion_compra','venta',
    'produccion_consumo','produccion_entrada','devolucion_venta','cierre_fisico']));

-- === ALTA ATÓMICA ===========================================================
create or replace function public.fn_crear_cierre(
  p_bodega uuid,
  p_fecha  date,
  p_lineas jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_centro uuid; r jsonb; i int := 0;
  v_costo numeric(18,4); v_teo numeric(18,4); v_fis numeric(18,4);
  v_vt numeric(18,2) := 0; v_vf numeric(18,2) := 0; v_vtl numeric(18,2); v_vfl numeric(18,2);
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El cierre no tiene líneas.'; end if;
  v_centro := public.fn_centro_de_bodega(p_bodega);

  insert into public.cierres_inventario (fecha, bodega_id, centro_costo_id)
  values (coalesce(p_fecha, (now() at time zone 'America/Costa_Rica')::date), p_bodega, v_centro)
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    v_fis := (r->>'cantidad_fisica')::numeric;
    select coalesce(costo_promedio,0) into v_costo from public.articulos_saldos where articulo_id = (r->>'articulo_id')::uuid;
    v_costo := coalesce(v_costo, 0);
    select coalesce(cantidad,0) into v_teo from public.existencias where articulo_id = (r->>'articulo_id')::uuid and bodega_id = p_bodega;
    v_teo := coalesce(v_teo, 0);
    v_vtl := round(v_teo * v_costo, 2);
    v_vfl := round(v_fis * v_costo, 2);
    insert into public.cierres_inventario_lineas
      (cierre_id, linea, articulo_id, cantidad_teorica, cantidad_fisica, costo_promedio, valor_teorico, valor_fisico)
    values (v_id, i, (r->>'articulo_id')::uuid, v_teo, v_fis, v_costo, v_vtl, v_vfl);
    v_vt := v_vt + v_vtl; v_vf := v_vf + v_vfl;
  end loop;

  update public.cierres_inventario set valor_teorico = v_vt, valor_fisico = v_vf, diferencia = v_vf - v_vt where id = v_id;
  return v_id;
end $$;
grant execute on function public.fn_crear_cierre(uuid, date, jsonb) to authenticated;

-- === CONFIRMAR ==============================================================
create or replace function public.fn_confirmar_cierre(p_cierre uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text; v_fecha date; v_bodega uuid; v_centro uuid; v_vf numeric(18,2);
  v_prev numeric(18,2); v_delta numeric(18,2); v_cta_inv uuid; v_cta_aj uuid;
  v_lineas jsonb; v_asiento uuid; r record; v_actual numeric(18,4); v_diff numeric(18,4);
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado, fecha, bodega_id, centro_costo_id, valor_fisico
    into v_estado, v_fecha, v_bodega, v_centro, v_vf
    from public.cierres_inventario where id = p_cierre;
  if v_estado is null then raise exception 'Cierre inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'El cierre ya está %.', v_estado; end if;
  if v_centro is null then raise exception 'La bodega no tiene centro de costo.'; end if;

  select id into v_cta_inv from public.cuentas where codigo = '11-60-01-00-00';
  select id into v_cta_aj  from public.cuentas where codigo = '51-10-03-00-00';

  -- Inventario final del cierre anterior de esta bodega (lo que hay que reversar).
  select coalesce(valor_fisico, 0) into v_prev
    from public.cierres_inventario
   where bodega_id = v_bodega and estado = 'confirmado' and fecha <= v_fecha and id <> p_cierre
   order by fecha desc, confirmado_en desc limit 1;
  v_prev := coalesce(v_prev, 0);
  v_delta := v_vf - v_prev;

  if v_delta <> 0 then
    if v_delta > 0 then
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta_id', v_cta_inv, 'debito',  v_delta, 'detalle','Inventario final (cierre)'),
        jsonb_build_object('cuenta_id', v_cta_aj,  'credito', v_delta, 'centro_costo_id', v_centro, 'detalle','Ajuste por inventario'));
    else
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta_id', v_cta_aj,  'debito',  -v_delta, 'centro_costo_id', v_centro, 'detalle','Ajuste por inventario'),
        jsonb_build_object('cuenta_id', v_cta_inv, 'credito', -v_delta, 'detalle','Inventario final (cierre)'));
    end if;
    v_asiento := public.fn_postear_asiento('diario', v_fecha, 'Cierre de inventario', 'cierre_inventario', p_cierre, v_lineas);
  end if;

  -- Ajusta el kardex al conteo físico (cantidad), sin asiento.
  for r in select * from public.cierres_inventario_lineas where cierre_id = p_cierre loop
    select coalesce(cantidad,0) into v_actual from public.existencias where articulo_id = r.articulo_id and bodega_id = v_bodega;
    v_actual := coalesce(v_actual, 0);
    v_diff := r.cantidad_fisica - v_actual;
    if v_diff <> 0 then
      insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
      values (r.articulo_id, v_bodega, v_fecha,
              case when v_diff > 0 then 'ajuste_pos' else 'ajuste_neg' end,
              v_diff, 'cierre_inventario', p_cierre, 'Ajuste a conteo físico');
    end if;
  end loop;

  update public.cierres_inventario set estado='confirmado', asiento_id=v_asiento, confirmado_en=now(), confirmado_por=auth.uid() where id = p_cierre;
  return v_asiento;
end $$;
grant execute on function public.fn_confirmar_cierre(uuid) to authenticated;

-- === ANULAR =================================================================
create or replace function public.fn_anular_cierre(p_cierre uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; v_bodega uuid; r record;
begin
  perform public.fn_exigir_permiso('inventario.ajustar');
  select estado, bodega_id into v_estado, v_bodega from public.cierres_inventario where id = p_cierre;
  if v_estado is null then raise exception 'Cierre inexistente.'; end if;
  if v_estado <> 'confirmado' then raise exception 'Solo se anula un cierre confirmado (está %).', v_estado; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Reversa del ajuste de kardex (signo opuesto, tipo según el nuevo signo).
  for r in select articulo_id, cantidad from public.movimientos_inventario
            where origen_tipo='cierre_inventario' and origen_id=p_cierre and tipo in ('ajuste_pos','ajuste_neg') loop
    insert into public.movimientos_inventario (articulo_id, bodega_id, fecha, tipo, cantidad, origen_tipo, origen_id, detalle)
    values (r.articulo_id, v_bodega, (now() at time zone 'America/Costa_Rica')::date,
            case when -r.cantidad > 0 then 'ajuste_pos' else 'ajuste_neg' end,
            -r.cantidad, 'cierre_anulacion', p_cierre, 'Reversa de cierre anulado');
  end loop;

  perform public.fn_anular_asiento_auto('cierre_inventario', p_cierre, p_motivo);
  update public.cierres_inventario set estado='anulado', anulado_en=now(), anulado_por=auth.uid() where id = p_cierre;
end $$;
grant execute on function public.fn_anular_cierre(uuid, text) to authenticated;

-- === RLS ====================================================================
alter table public.cierres_inventario        enable row level security;
alter table public.cierres_inventario_lineas  enable row level security;
create policy cierre_sel on public.cierres_inventario for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('inventario.ver'));
create policy cierre_wr on public.cierres_inventario for all to authenticated
  using (public.tengo_permiso('inventario.ajustar')) with check (public.tengo_permiso('inventario.ajustar'));
create policy cierrel_all on public.cierres_inventario_lineas for all to authenticated
  using (public.soy_administrador() or public.tengo_permiso('inventario.ver')) with check (public.tengo_permiso('inventario.ajustar'));

do $$ begin raise notice 'Cierre de inventario periódico listo.'; end $$;
