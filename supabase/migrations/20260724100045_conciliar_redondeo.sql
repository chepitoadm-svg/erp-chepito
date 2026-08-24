-- =============================================================================
-- Conciliar con REDONDEO: casar una línea del banco con un movimiento de libros
-- cuando difieren por unos pocos colones (redondeo/centavos). Se postea un
-- asiento chico que ajusta el banco por la diferencia contra la cuenta de
-- redondeo (ingreso 43-10-04 si sobró, gasto 62-09 si faltó), de modo que el
-- saldo de libros calce con el del banco. Tolerancia por defecto ₡100.
--
-- El asiento de redondeo lleva origen_tipo='conciliacion_redondeo' (idempotente
-- por la línea del banco). Se excluye de "movimientos pendientes" pero SÍ cuenta
-- en el saldo de libros, para que la conciliación cierre.
-- =============================================================================

create or replace function public.fn_conciliar_redondeo(
  p_linea uuid, p_asiento_linea uuid, p_tolerancia numeric default 100
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conc uuid; v_estado text; v_banco uuid; v_fecha date;
  v_l_deb numeric; v_l_cre numeric;
  v_m_cuenta uuid; v_m_deb numeric; v_m_cre numeric; v_m_estado text;
  v_res numeric; v_ya int; v_cta_red uuid; v_centro uuid;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');

  select ecl.conciliacion_id, cb.estado, cb.cuenta_id, cb.fecha_corte, ecl.debito, ecl.credito
    into v_conc, v_estado, v_banco, v_fecha, v_l_deb, v_l_cre
    from public.estado_cuenta_lineas ecl
    join public.conciliaciones_banco cb on cb.id = ecl.conciliacion_id
   where ecl.id = p_linea;
  if v_conc is null then raise exception 'Línea del banco inexistente.'; end if;
  if v_estado <> 'borrador' then raise exception 'La conciliación ya está %.', v_estado; end if;

  select l.cuenta_id, l.debito, l.credito, a.estado
    into v_m_cuenta, v_m_deb, v_m_cre, v_m_estado
    from public.asientos_lineas l join public.asientos a on a.id = l.asiento_id
   where l.id = p_asiento_linea;
  if v_m_cuenta is null then raise exception 'Movimiento de libros inexistente.'; end if;
  if v_m_estado <> 'confirmado' then raise exception 'El movimiento de libros no está confirmado.'; end if;
  if v_m_cuenta <> v_banco then raise exception 'El movimiento no es de la misma cuenta bancaria.'; end if;
  select count(*) into v_ya from public.estado_cuenta_lineas where asiento_linea_id = p_asiento_linea;
  if v_ya > 0 then raise exception 'Ese movimiento de libros ya está conciliado.'; end if;

  -- Diferencia (residuo) a mandar a redondeo. >0: en libros salió/entró de más
  -- por esa cantidad; <0: de menos.
  v_res := round((v_m_cre - v_l_deb) - (v_m_deb - v_l_cre), 2);
  if v_res = 0 then raise exception 'No hay diferencia; usá "Conciliar" normal.'; end if;
  if abs(v_res) > p_tolerancia then
    raise exception 'La diferencia (%) supera la tolerancia de redondeo (%). Revisá el monto.', v_res, p_tolerancia;
  end if;

  select id into v_centro from public.centros_costo where codigo = 'GEN' and activo;
  if v_res > 0 then
    select id into v_cta_red from public.cuentas where codigo = '43-10-04-00-00'; -- Ingresos por redondeo
  else
    select id into v_cta_red from public.cuentas where codigo = '62-09-00-00-00'; -- Gastos por redondeo
  end if;
  if v_cta_red is null or v_centro is null then
    raise exception 'Falta la cuenta de redondeo (43-10-04 / 62-09) o el centro GEN.';
  end if;

  -- Asiento de ajuste: calza el banco de libros con el estado de cuenta.
  perform public.fn_postear_asiento(
    'diario', v_fecha, 'Redondeo en conciliación bancaria',
    'conciliacion_redondeo', p_linea,
    case when v_res > 0 then jsonb_build_array(
        jsonb_build_object('cuenta_id', v_banco, 'debito', v_res, 'detalle', 'Ajuste por redondeo'),
        jsonb_build_object('cuenta_id', v_cta_red, 'credito', v_res, 'centro_costo_id', v_centro, 'detalle', 'Redondeo conciliación'))
      else jsonb_build_array(
        jsonb_build_object('cuenta_id', v_banco, 'credito', -v_res, 'detalle', 'Ajuste por redondeo'),
        jsonb_build_object('cuenta_id', v_cta_red, 'debito', -v_res, 'centro_costo_id', v_centro, 'detalle', 'Redondeo conciliación'))
    end
  );

  update public.estado_cuenta_lineas set asiento_linea_id = p_asiento_linea, estado = 'conciliada'
   where id = p_linea;
end $$;
grant execute on function public.fn_conciliar_redondeo(uuid, uuid, numeric) to authenticated;

-- Al anular la conciliación, reversar también sus asientos de redondeo.
create or replace function public.fn_anular_conciliacion(p_conciliacion uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text; r record;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.conciliaciones_banco where id = p_conciliacion;
  if v_estado is null then raise exception 'Conciliación inexistente.'; end if;
  if v_estado = 'anulada' then raise exception 'Ya está anulada.'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'La anulación exige un motivo.'; end if;

  -- Reversa los asientos de redondeo creados por esta conciliación.
  for r in select id from public.estado_cuenta_lineas where conciliacion_id = p_conciliacion loop
    perform public.fn_anular_asiento_auto('conciliacion_redondeo', r.id, 'Anulación de conciliación');
  end loop;

  update public.estado_cuenta_lineas set asiento_linea_id = null, estado = 'pendiente' where conciliacion_id = p_conciliacion;
  update public.conciliaciones_banco set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid() where id = p_conciliacion;
end $$;
grant execute on function public.fn_anular_conciliacion(uuid, text) to authenticated;

do $$ begin raise notice 'fn_conciliar_redondeo lista.'; end $$;
