-- =============================================================================
-- Soporte de UI para el prorrateo por cuenta:
--   - Flag centros_costo.prorrateo_por_cuenta (General = true, Taller = false).
--   - app_guardar_bases_prorrateo acepta p_cuenta (NULL = base del centro).
--   - app_cuentas_prorrateo: cuentas con saldo en un centro + sus bases por cuenta.
-- =============================================================================

alter table public.centros_costo
  add column if not exists prorrateo_por_cuenta boolean not null default false;
update public.centros_costo set prorrateo_por_cuenta = true where codigo = 'GEN';

-- Guardar bases: por cuenta si p_cuenta no es NULL; del centro si NULL.
create or replace function public.app_guardar_bases_prorrateo(
  p_periodo uuid,
  p_origen  uuid,
  p_bases   jsonb,
  p_cuenta  uuid default null
)
returns void
language plpgsql
security invoker
as $$
declare v_b jsonb;
begin
  perform public.fn_exigir_permiso('prorrateo.gestionar');

  delete from public.prorrateo_bases
   where periodo_id = p_periodo and centro_origen_id = p_origen
     and cuenta_id is not distinct from p_cuenta;

  for v_b in select * from jsonb_array_elements(coalesce(p_bases, '[]'::jsonb))
  loop
    insert into public.prorrateo_bases
      (periodo_id, centro_origen_id, cuenta_id, centro_destino_id, porcentaje)
    values (
      p_periodo, p_origen, p_cuenta,
      (v_b->>'centro_destino_id')::uuid,
      (v_b->>'porcentaje')::numeric
    );
  end loop;
end;
$$;

-- Cuentas con saldo en un centro intermedio ese periodo, con sus bases por cuenta.
create or replace function public.app_cuentas_prorrateo(p_periodo uuid, p_origen uuid)
returns table (cuenta_id uuid, codigo text, nombre text, pool numeric(18,2), suma_bases numeric(9,4), bases jsonb)
language sql stable security definer set search_path = public as $$
  select cu.id, cu.codigo, cu.nombre,
    round(sum(l.debito) - sum(l.credito), 2) as pool,
    coalesce((select sum(b.porcentaje) from public.prorrateo_bases b
       where b.periodo_id = p_periodo and b.centro_origen_id = p_origen and b.cuenta_id = cu.id), 0) as suma_bases,
    coalesce((select jsonb_agg(jsonb_build_object('centro_destino_id', b.centro_destino_id, 'porcentaje', b.porcentaje))
       from public.prorrateo_bases b
      where b.periodo_id = p_periodo and b.centro_origen_id = p_origen and b.cuenta_id = cu.id), '[]'::jsonb) as bases
  from public.asientos_lineas l
  join public.asientos a on a.id = l.asiento_id
  join public.cuentas cu on cu.id = l.cuenta_id
  where a.estado = 'confirmado' and a.periodo_id = p_periodo and l.centro_costo_id = p_origen
  group by cu.id, cu.codigo, cu.nombre
  having round(sum(l.debito) - sum(l.credito), 2) <> 0
  order by cu.codigo;
$$;
grant execute on function public.app_cuentas_prorrateo(uuid, uuid) to authenticated;

do $$ begin raise notice 'UI prorrateo por cuenta: flag + guardar con cuenta + app_cuentas_prorrateo.'; end $$;
