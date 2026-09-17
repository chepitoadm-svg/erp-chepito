-- =============================================================================
-- Cierre: ligar el requisito "Ingreso costo de desechos mensual" al módulo de
-- desecho (Costos → Desecho del mes). Antes era manual: aunque el desecho del
-- mes estuviera posteado, el cierre lo mostraba pendiente. Ahora se auto-marca
-- LISTO cuando el desecho del mes está posteado (todas las panaderías cargadas).
-- =============================================================================

-- 1) Permitir la nueva fuente 'desecho' en el check de auto_fuente.
do $$ declare v text; begin
  select conname into v from pg_constraint
   where conrelid = 'public.cierre_requisito'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%auto_fuente%';
  if v is not null then execute 'alter table public.cierre_requisito drop constraint ' || quote_ident(v); end if;
end $$;
alter table public.cierre_requisito
  add constraint cierre_requisito_auto_fuente_check
  check (auto_fuente in ('ventas','compras','planilla','conciliacion','retiros_caja','retiros_dep','salidas_vext','desecho'));

-- 2) Agregar la rama 'desecho' a fn_cierre_auto: listo cuando TODAS las filas de
--    desecho_mes del período están posteadas (y hay al menos una).
create or replace function public.fn_cierre_auto(p_auto text, p_ini date, p_fin date, p_centro uuid, p_cuenta uuid)
returns table(listo boolean, n integer, monto numeric, detalle text)
language plpgsql stable set search_path = public as $function$
declare v_n int; v_m numeric; v_pend int; v_hay boolean; v_tot int; v_ing int;
begin
  if p_auto = 'ventas' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.ventas_dia
      where estado='confirmado' and fecha between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'compras' then
    select count(*), coalesce(sum(total),0) into v_n, v_m from public.facturas_compra
      where estado <> 'anulada' and fecha_emision between p_ini and p_fin
        and (p_centro is null or centro_costo_id = p_centro);
    return query select v_n>0, v_n, v_m, null::text;
  elsif p_auto = 'planilla' then
    select count(*) into v_n from public.planilla
      where fecha between p_ini and p_fin and asiento_id is not null and estado <> 'anulada';
    return query select v_n>0, v_n, null::numeric, null::text;
  elsif p_auto = 'desecho' then
    select count(*), count(*) filter (where posteado)
      into v_tot, v_ing from public.desecho_mes
      where periodo between p_ini and p_fin;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_cargar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'desecho'::text; end if;
  elsif p_auto = 'retiros_caja' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing from public.retiro_caja
      where fuente = 'qupos' and centro_id = p_centro
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_importar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text; end if;
  elsif p_auto = 'retiros_dep' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing from public.retiro_caja
      where fuente = 'depositos'
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_importar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'retiros'::text; end if;
  elsif p_auto = 'salidas_vext' then
    select count(*) filter (where estado <> 'na'), count(*) filter (where estado = 'ingresado')
      into v_tot, v_ing from public.retiro_caja
      where fuente = 'venta_ext'
        and anio = extract(year from p_ini)::int and mes = extract(month from p_ini)::int;
    if coalesce(v_tot,0) = 0 then return query select false, 0, 0::numeric, 'sin_importar'::text;
    else return query select (v_ing = v_tot), v_ing, v_tot::numeric, 'salidas'::text; end if;
  elsif p_auto = 'conciliacion' then
    select exists (select 1 from public.conciliaciones_banco cb
      where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin)
      into v_hay;
    if not v_hay then return query select false, null::int, null::numeric, 'sin_estado'::text;
    else
      select count(*) filter (where l.estado='pendiente') into v_pend
        from public.conciliaciones_banco cb
        join public.estado_cuenta_lineas l on l.conciliacion_id = cb.id
        where cb.cuenta_id = p_cuenta and cb.estado <> 'anulada' and cb.fecha_corte between p_ini and p_fin;
      return query select (coalesce(v_pend,0)=0), v_pend, null::numeric, 'concil'::text;
    end if;
  else
    return query select null::boolean, null::int, null::numeric, null::text;
  end if;
end $function$;

-- 3) Ligar el requisito. Deja de pedir archivo (el dato vive en el módulo).
update public.cierre_requisito
   set auto_fuente = 'desecho', requiere_archivo = false
 where codigo = 'ingreso_costo_de_desechos_mensual';

do $$ begin raise notice 'Cierre: requisito de desechos ligado al módulo (auto).'; end $$;
