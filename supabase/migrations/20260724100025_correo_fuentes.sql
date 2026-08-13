-- =============================================================================
-- Fuentes de correo para el jalador automático de XML.
-- El usuario elige DESDE EL ERP qué remitentes jalar, los prende/apaga, y desde
-- qué fecha. El jalador (GitHub Actions + IMAP) lee las fuentes activas y trae
-- los XML de esos remitentes a partir de 'desde'. 'ultimo_jalado' es informativo.
-- =============================================================================

create table public.correo_fuentes (
  id             uuid primary key default gen_random_uuid(),
  remitente      text not null unique,   -- dirección del remitente (from) a jalar
  etiqueta       text not null,          -- nombre amigable (proveedor)
  proveedor_id   uuid references public.proveedores(id),
  activo         boolean not null default true,
  desde          date not null default (now() at time zone 'America/Costa_Rica')::date,
  ultimo_jalado  timestamptz,
  creado_en      timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  actualizado_en timestamptz, actualizado_por uuid
);
select public.fn_adjuntar_auditoria('public.correo_fuentes');

alter table public.correo_fuentes enable row level security;
create policy correo_fuentes_sel on public.correo_fuentes for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy correo_fuentes_wr on public.correo_fuentes for all to authenticated
  using (public.tengo_permiso('compras.facturar')) with check (public.tengo_permiso('compras.facturar'));

-- Seed con los remitentes recurrentes ya identificados (el usuario ajusta desde el ERP).
insert into public.correo_fuentes (remitente, etiqueta) values
  ('dospinosfacturaelectronica@avdinternacional.com', 'Dos Pinos'),
  ('sigma.fe@avdinternacional.com', 'Sigma Alimentos'),
  ('cr_facturacion_distribucion@mail.gosocket.net', 'Coca Cola Femsa'),
  ('armonia.facturaelectronica@edi.co.cr', 'Distribuidora Universal'),
  ('facturacion@carnicerialacentral.com', 'Carnicería La Central'),
  ('comprobantedigital@tiqueso.com', 'Tiqueso')
on conflict (remitente) do nothing;

do $$ begin raise notice 'correo_fuentes listo.'; end $$;
