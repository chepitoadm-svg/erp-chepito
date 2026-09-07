-- =============================================================================
-- Permite subir el estado de cuenta POR PARTES: anexa las líneas nuevas del .xls
-- a una conciliación en borrador que ya se venía trabajando, sin duplicar las que
-- ya estén (dedup por referencia+fecha+débito+crédito+descripción). Devuelve
-- cuántas líneas nuevas se agregaron. Actualiza el saldo final del banco.
-- =============================================================================

create or replace function public.fn_agregar_lineas_conciliacion(
  p_conciliacion uuid, p_saldo_final numeric, p_lineas jsonb
) returns int language plpgsql security definer set search_path = public as $$
declare v_estado text; v_i int; v_ins int := 0; r jsonb;
        v_ref text; v_fecha date; v_deb numeric; v_cred numeric; v_desc text;
begin
  perform public.fn_exigir_permiso('tesoreria.conciliar');
  select estado into v_estado from public.conciliaciones_banco where id = p_conciliacion;
  if v_estado is null then raise exception 'Conciliación inexistente.'; end if;
  if v_estado <> 'borrador' then
    raise exception 'La conciliación está %; reabrila para editar antes de importar más.', v_estado; end if;

  select coalesce(max(orden), 0) into v_i from public.estado_cuenta_lineas where conciliacion_id = p_conciliacion;

  if jsonb_typeof(p_lineas) = 'array' then
    for r in select * from jsonb_array_elements(p_lineas) loop
      v_ref  := nullif(r->>'referencia','');
      v_fecha:= (r->>'fecha')::date;
      v_deb  := round(coalesce((r->>'debito')::numeric,0),2);
      v_cred := round(coalesce((r->>'credito')::numeric,0),2);
      v_desc := nullif(r->>'descripcion','');
      -- ¿ya existe esta línea? (misma referencia/fecha/monto/detalle) → no duplicar
      if exists (
        select 1 from public.estado_cuenta_lineas e
         where e.conciliacion_id = p_conciliacion
           and coalesce(e.referencia,'') = coalesce(v_ref,'')
           and e.fecha = v_fecha and e.debito = v_deb and e.credito = v_cred
           and coalesce(e.descripcion,'') = coalesce(v_desc,'')
      ) then continue; end if;

      v_i := v_i + 1; v_ins := v_ins + 1;
      insert into public.estado_cuenta_lineas
        (conciliacion_id, orden, fecha, referencia, codigo, descripcion, debito, credito, balance)
      values (p_conciliacion, v_i, v_fecha, v_ref, nullif(r->>'codigo',''), v_desc, v_deb, v_cred,
              nullif(r->>'balance','')::numeric);
    end loop;
  end if;

  if p_saldo_final is not null then
    update public.conciliaciones_banco set saldo_final = round(p_saldo_final,2) where id = p_conciliacion;
  end if;
  return v_ins;
end $$;
grant execute on function public.fn_agregar_lineas_conciliacion(uuid, numeric, jsonb) to authenticated;

do $$ begin raise notice 'importar estado de cuenta por partes listo.'; end $$;
