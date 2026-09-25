-- =============================================================================
-- Las cuentas por prorratear deben verse SIEMPRE, aunque el centro ya tenga un
-- prorrateo confirmado. Antes app_cuentas_prorrateo excluía solo las reversiones
-- pero NO el propio prorrateo, así que al confirmar, cada cuenta quedaba en cero
-- (pool - vaciado) y la pantalla decía "No hay cuentas con saldo" aunque el pool
-- (app_estado_prorrateo) sí se veía. Ahora excluye también tipo='prorrateo', así
-- muestra el GASTO REAL por cuenta del centro, exista o no un prorrateo. Queda
-- consistente con el pool y con fn_generar_prorrateo.
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
  where a.estado = 'confirmado' and a.tipo not in ('reversion', 'prorrateo')
    and a.periodo_id = p_periodo and l.centro_costo_id = p_origen
  group by cu.id, cu.codigo, cu.nombre
  having round(sum(l.debito) - sum(l.credito), 2) <> 0
  order by cu.codigo;
$$;
grant execute on function public.app_cuentas_prorrateo(uuid, uuid) to authenticated;

do $$ begin raise notice 'app_cuentas_prorrateo muestra el gasto real por cuenta aunque ya haya prorrateo.'; end $$;
