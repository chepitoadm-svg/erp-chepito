-- =============================================================================
-- Fase 3 — Migración 14 (Ingestor 1/2): tabla de staging de comprobantes.
--
-- Guarda cada XML subido (comprobante + respuesta de Hacienda) con sus datos
-- parseados y un estado que dirige el flujo:
--   recibido → validado → procesado (factura creada)
--                       ↘ requiere_mapeo (falta ligar algún CodigoComercial)
--                       ↘ error (rechazado por Hacienda / receptor / proveedor)
--                       ↘ descartado
-- El parser y la validación viven en el server (TS). El correo automático
-- (IMAP/webhook) será un enganche posterior sobre esta misma tabla.
-- =============================================================================

create table public.comprobantes_ingesta (
  id               uuid primary key default gen_random_uuid(),
  clave            text unique,                 -- 50 dígitos; idempotencia real
  tipo_documento   text,                        -- tag raíz (FacturaElectronica…)
  estado           text not null default 'recibido'
                     check (estado in ('recibido','validado','requiere_mapeo','procesado','error','descartado')),
  -- Datos parseados del comprobante
  emisor_cedula    text,
  emisor_nombre    text,
  receptor_cedula  text,
  consecutivo      text,
  fecha_emision    date,
  condicion_venta  text,
  plazo_credito    int,
  fecha_vencimiento date,
  moneda           text,
  tipo_cambio      numeric(18,6),
  subtotal         numeric(18,2),
  iva_total        numeric(18,2),
  total            numeric(18,2),
  -- De la respuesta de Hacienda
  estado_hacienda  text,                        -- EstadoMensaje: Aceptado/Rechazado
  -- Vínculos y diagnóstico
  proveedor_id     uuid references public.proveedores(id),
  factura_id       uuid references public.facturas_compra(id),
  error_detalle    text,
  lineas           jsonb,                        -- líneas parseadas + estado de mapeo
  xml_comprobante  text not null,
  xml_respuesta    text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid(),
  actualizado_en   timestamptz,
  actualizado_por  uuid
);
comment on table public.comprobantes_ingesta is
  'Staging de XML de Hacienda subidos a mano; alimenta la creación de facturas de compra.';

create index ix_ingesta_estado on public.comprobantes_ingesta (estado);
create index ix_ingesta_proveedor on public.comprobantes_ingesta (proveedor_id);

select public.fn_adjuntar_auditoria('public.comprobantes_ingesta');

create trigger trg_ingesta_no_delete before delete on public.comprobantes_ingesta
  for each row execute function public.fn_bloquear_delete();

alter table public.comprobantes_ingesta enable row level security;
-- Ver y trabajar la bandeja del ingestor requiere permiso de facturar compras.
create policy ingesta_sel on public.comprobantes_ingesta for select to authenticated
  using (public.soy_administrador() or public.tengo_permiso('compras.facturar'));
create policy ingesta_wr on public.comprobantes_ingesta for all to authenticated
  using (public.tengo_permiso('compras.facturar'))
  with check (public.tengo_permiso('compras.facturar'));

do $$
begin
  raise notice 'Staging del ingestor lista: comprobantes_ingesta.';
end $$;
