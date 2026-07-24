-- =============================================================================
-- FIX: no se podían RE-guardar las bases de prorrateo.
--
-- app_guardar_bases_prorrateo reemplaza el set completo con DELETE + INSERT.
-- La migración de RLS creó políticas de select/insert/update para
-- prorrateo_bases pero NO de delete, así que con RLS activo el DELETE no
-- borraba nada (silenciosamente, no da error) y los INSERT siguientes chocaban
-- con las filas existentes:
--   duplicate key value violates unique constraint
--   "prorrateo_bases_periodo_id_centro_origen_id_centro_destino__key"
--
-- La primera carga de bases funcionaba (no había nada que borrar); el fallo
-- solo aparecía al volver a guardar. Se agrega la política de DELETE con el
-- mismo permiso que ya exigen insert y update.
-- =============================================================================

create policy bases_delete on public.prorrateo_bases
  for delete to authenticated
  using (public.tengo_permiso('prorrateo.gestionar'));

do $$
begin
  raise notice 'Política de DELETE en prorrateo_bases agregada: ya se pueden re-guardar las bases.';
end $$;
