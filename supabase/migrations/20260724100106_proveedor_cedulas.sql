-- =============================================================================
-- Un proveedor puede facturar con VARIAS cédulas (mismo proveedor, distinta razón
-- social / entidad que emite según la sucursal). El ingestor rutea la factura al
-- proveedor por la cédula del emisor; con esta tabla, además de la cédula
-- principal (proveedores.cedula_juridica), se aceptan cédulas alias que rutean al
-- mismo proveedor.
--
-- Ej.: DISTRIBUIDORA UNIVERSAL factura a veces con 3101109922 (principal) y a
-- veces con 3101337659 (alias). Ambas caen en el mismo proveedor.
-- =============================================================================

create table if not exists public.proveedor_cedulas (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references public.proveedores(id),
  cedula          text not null unique,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);

comment on table public.proveedor_cedulas is
  'Cédulas alias de un proveedor: el ingestor rutea la factura a este proveedor '
  'aunque el emisor use una cédula distinta de la principal.';

create index if not exists ix_proveedor_cedulas_prov on public.proveedor_cedulas (proveedor_id);

select public.fn_adjuntar_auditoria('public.proveedor_cedulas');

alter table public.proveedor_cedulas enable row level security;
create policy pc_sel on public.proveedor_cedulas for select to authenticated using (true);
create policy pc_wr  on public.proveedor_cedulas for all to authenticated
  using (public.tengo_permiso('proveedores.gestionar'))
  with check (public.tengo_permiso('proveedores.gestionar'));

-- Semilla: 3101337659 es alias de DISTRIBUIDORA UNIVERSAL (principal 3101109922).
insert into public.proveedor_cedulas (proveedor_id, cedula)
select p.id, '3101337659'
  from public.proveedores p
 where p.cedula_juridica = '3101109922'
   and not exists (select 1 from public.proveedor_cedulas c where c.cedula = '3101337659')
   and not exists (select 1 from public.proveedores p2 where p2.cedula_juridica = '3101337659');

do $$ begin raise notice 'proveedor_cedulas lista; 3101337659 alias de Distribuidora Universal.'; end $$;
