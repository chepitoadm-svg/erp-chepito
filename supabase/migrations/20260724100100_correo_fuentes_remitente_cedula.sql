-- =============================================================================
-- Remitentes de correo compartidos: un mismo correo (facturador tercerizado como
-- avdinternacional, gosocket, edi) factura para VARIOS proveedores. La restricción
-- única era solo por `remitente`, así que no se podía agregar dos proveedores con
-- el mismo correo. Ahora la unicidad es por (remitente + cédula del emisor), y se
-- diferencian por la cédula. Cada factura se rutea al proveedor por su cédula.
-- =============================================================================

-- Quitar la restricción única de solo remitente.
do $$ declare v text; begin
  select conname into v from pg_constraint
   where conrelid = 'public.correo_fuentes'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(remitente)%';
  if v is not null then execute 'alter table public.correo_fuentes drop constraint ' || quote_ident(v); end if;
end $$;

-- Única por remitente + cédula (coalesce para tratar NULL como valor, así no se
-- repite el mismo remitente sin cédula, pero sí con cédulas distintas).
create unique index if not exists correo_fuentes_remitente_cedula_uq
  on public.correo_fuentes (remitente, coalesce(cedula_emisor, ''));

do $$ begin raise notice 'correo_fuentes: unico por remitente+cedula.'; end $$;
