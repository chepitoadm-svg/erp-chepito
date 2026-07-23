-- =============================================================================
-- Centros de costo.
--
-- SUPERA la decisión de la Fase 1 de que "sucursal = centro de costo". No son
-- lo mismo: "Venta externa" y "General" no son sucursales físicas, y el Taller
-- es un acumulador intermedio, no un canal de venta.
--
-- Dos tipos:
--   final       -> sale como columna en el Estado de Resultados por canal.
--   intermedio  -> acumula gasto compartido que a fin de mes se reparte a los
--                  finales mediante un asiento de prorrateo.
--
-- El inventario por bodega (Taller, Chepito 1, Chepito 2) se lleva en el kardex
-- del módulo de inventario. NO se mezcla con el centro de costo contable.
--
-- Agregar un centro nuevo (una cuarta sucursal, separar Mayoreo de Venta
-- externa) debe ser un INSERT en esta tabla y nada más. Sin enums, sin CHECK
-- de valores fijos, sin migración de esquema.
-- =============================================================================

create table public.centros_costo (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  nombre              text not null,
  tipo                text not null check (tipo in ('final', 'intermedio')),
  parent_id           uuid references public.centros_costo(id),
  -- Liga opcional a una sucursal física, cuando el centro corresponde a una.
  -- Nullable a propósito: "Venta externa" y "General" no tienen sucursal.
  sucursal_id         uuid references public.sucursales(id),
  activo              boolean not null default true,
  -- Distingue "este pool no se reparte" de "se me olvidó cargar las bases".
  -- Solo aplica a los intermedios (ver CHECK abajo).
  requiere_prorrateo  boolean not null default false,
  creado_en           timestamptz not null default now(),
  creado_por          uuid default auth.uid(),
  actualizado_en      timestamptz,
  actualizado_por     uuid,
  -- Un centro final nunca se prorratea: es destino, no origen.
  constraint centros_costo_prorrateo_solo_intermedio
    check (not (requiere_prorrateo and tipo = 'final')),
  constraint centros_costo_sin_autopadre check (id <> parent_id)
);

comment on table public.centros_costo is
  'Centros de costo. Extensible sin migración: agregar uno es un INSERT.';
comment on column public.centros_costo.requiere_prorrateo is
  'Si es true y el periodo no tiene bases cargadas, el cierre de periodo falla '
  'identificando el pool. Distingue el olvido de la decisión.';
comment on column public.centros_costo.activo is
  'Baja lógica. Un centro con movimientos históricos NUNCA se borra.';

create index ix_centros_costo_tipo   on public.centros_costo (tipo) where activo;
create index ix_centros_costo_parent on public.centros_costo (parent_id);

select public.fn_adjuntar_auditoria('public.centros_costo');

-- === SEMILLA ================================================================
-- Finales: los tres canales que hoy salen en el Estado de Resultados.
-- Intermedios: los dos acumuladores de gasto compartido.
insert into public.centros_costo (codigo, nombre, tipo, requiere_prorrateo) values
  ('CH1', 'Chepito 1',     'final',      false),
  ('CH2', 'Chepito 2',     'final',      false),
  ('VEX', 'Venta externa', 'final',      false),
  ('TAL', 'Taller',        'intermedio', true),
  ('GEN', 'General',       'intermedio', true)
on conflict (codigo) do nothing;

-- Ligar con las sucursales físicas donde aplica. Venta externa y General no
-- tienen sucursal y quedan en NULL.
update public.centros_costo cc
   set sucursal_id = s.id
  from public.sucursales s
 where s.codigo = cc.codigo
   and cc.sucursal_id is null;

do $$
declare v_finales int; v_inter int; v_ligados int;
begin
  select count(*) into v_finales from public.centros_costo where tipo = 'final';
  select count(*) into v_inter   from public.centros_costo where tipo = 'intermedio';
  select count(*) into v_ligados from public.centros_costo where sucursal_id is not null;
  raise notice 'Centros de costo: % finales, % intermedios, % ligados a sucursal.',
    v_finales, v_inter, v_ligados;
end $$;
