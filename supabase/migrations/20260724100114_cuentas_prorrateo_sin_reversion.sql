-- =============================================================================
-- app_cuentas_prorrateo también debe excluir las reversiones (mismo bug que el
-- pool). Sin esto, la lista de cuentas del centro salía distinta del pool que
-- muestra app_estado_prorrateo (la pantalla decía "no hay cuentas" o montos
-- raros mientras el pool era correcto). Ahora usa el mismo criterio que el pool
-- y que fn_generar_prorrateo: confirmado y NO reversión = gasto bruto real.
-- =============================================================================

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
  where a.estado = 'confirmado' and a.tipo <> 'reversion'
    and a.periodo_id = p_periodo and l.centro_costo_id = p_origen
  group by cu.id, cu.codigo, cu.nombre
  having round(sum(l.debito) - sum(l.credito), 2) <> 0
  order by cu.codigo;
$$;
grant execute on function public.app_cuentas_prorrateo(uuid, uuid) to authenticated;

do $$ begin raise notice 'app_cuentas_prorrateo excluye reversiones (consistente con el pool).'; end $$;
