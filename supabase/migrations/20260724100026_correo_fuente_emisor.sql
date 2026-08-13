-- =============================================================================
-- Filtro por emisor en las fuentes de correo.
-- Algunos remitentes (proveedores de facturación como EDI, GoSocket) mandan
-- comprobantes de VARIOS emisores. Para jalar solo el proveedor que el usuario
-- quiere de ese remitente compartido, la fuente puede fijar 'cedula_emisor':
--   - cedula_emisor NULL  -> se acepta cualquier emisor de ese remitente (dedicados).
--   - cedula_emisor fijada -> solo se acepta ese emisor; los demás se ignoran.
-- =============================================================================

alter table public.correo_fuentes add column if not exists cedula_emisor text;

-- El remitente de EDI trae Distribuidora Universal y otros (ej. Jimenez & Tanzi).
-- Lo restringimos a Distribuidora Universal (céd. 3101109922).
update public.correo_fuentes
   set cedula_emisor = '3101109922'
 where remitente = 'armonia.facturaelectronica@edi.co.cr' and cedula_emisor is null;

do $$ begin raise notice 'correo_fuentes.cedula_emisor listo.'; end $$;
