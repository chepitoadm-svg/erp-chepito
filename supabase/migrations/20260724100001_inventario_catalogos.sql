-- =============================================================================
-- Fase 3 — Migración 1: catálogos de inventario y compras.
--   unidades, iva_tarifas, articulos, proveedores, proveedor_articulos
-- Sin lógica de kardex ni posteo todavía; solo los maestros.
-- =============================================================================

-- === CÉDULA DE LA EMPRESA ===================================================
-- Fuente de verdad para validar el Receptor de los XML de Hacienda (era null).
update public.empresa
   set cedula_juridica = '3101712291'
 where cedula_juridica is null;

-- === UNIDADES DE MEDIDA =====================================================
create table public.unidades (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nombre          text not null,
  activa          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);
comment on table public.unidades is 'Unidades de medida (stock y compra).';

insert into public.unidades (codigo, nombre) values
  ('UN',  'Unidad'),
  ('BOT', 'Botella'),
  ('CJ',  'Caja'),
  ('PAQ', 'Paquete'),
  ('DOC', 'Docena'),
  ('SACO','Saco'),
  ('KG',  'Kilogramo'),
  ('G',   'Gramo'),
  ('L',   'Litro'),
  ('ML',  'Mililitro')
on conflict (codigo) do nothing;

select public.fn_adjuntar_auditoria('public.unidades');

-- === TARIFAS DE IVA =========================================================
-- La tarifa de NUESTRO catálogo es la fuente de verdad (se amarra al artículo).
-- codigo_hacienda es el CodigoTarifaIVA v4.4 del XML, SOLO para comparar contra
-- lo que manda el proveedor y avisar diferencias, no para que el XML mande.
create table public.iva_tarifas (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,       -- nuestro código corto
  nombre          text not null,
  porcentaje      numeric(5,2) not null check (porcentaje >= 0),
  codigo_hacienda text,                        -- CodigoTarifaIVA v4.4
  activa          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);
comment on column public.iva_tarifas.codigo_hacienda is
  'CodigoTarifaIVA de Hacienda v4.4. Solo 08 (=13%) está confirmado por el '
  'usuario; el resto es best-effort y hay que verificarlo contra el catálogo '
  'oficial. Se usa únicamente para comparar contra el XML, no manda la tarifa.';

insert into public.iva_tarifas (codigo, nombre, porcentaje, codigo_hacienda) values
  ('13', 'IVA general 13%',      13.00, '08'),  -- confirmado por el usuario
  ('04', 'IVA reducido 4%',       4.00, '04'),  -- verificar
  ('02', 'IVA reducido 2%',       2.00, '03'),  -- verificar
  ('01', 'IVA reducido 1%',       1.00, '02'),  -- verificar
  ('00', 'Tarifa 0%',             0.00, '05'),  -- verificar
  ('EX', 'Exento',                0.00, '10')   -- verificar
on conflict (codigo) do nothing;

select public.fn_adjuntar_auditoria('public.iva_tarifas');

-- === ARTÍCULOS ==============================================================
create table public.articulos (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  nombre              text not null,
  tipo                text not null default 'suministro'
                        check (tipo in ('materia_prima','producto_terminado','suministro')),
  unidad_stock_id     uuid not null references public.unidades(id),
  iva_tarifa_id       uuid not null references public.iva_tarifas(id),
  cabys_codigo        text,                    -- informativo; NO manda la tarifa
  cuenta_inventario_id uuid references public.cuentas(id),
  inventariable       boolean not null default true,
  -- El promedio ponderado GLOBAL vive acá. Solo lo mueve el motor de kardex.
  costo_promedio      numeric(18,4) not null default 0 check (costo_promedio >= 0),
  existencia_total    numeric(18,4) not null default 0,
  estado              text not null default 'activo' check (estado in ('activo','inactivo')),
  creado_en           timestamptz not null default now(),
  creado_por          uuid default auth.uid(),
  actualizado_en      timestamptz,
  actualizado_por     uuid
);
comment on column public.articulos.costo_promedio is
  'Costo promedio ponderado GLOBAL. Lo actualiza SOLO el motor de kardex.';
comment on column public.articulos.existencia_total is
  'Suma de existencias de todas las bodegas. La detalla la tabla existencias.';

create index ix_articulos_tipo   on public.articulos (tipo) where estado = 'activo';
create index ix_articulos_cabys  on public.articulos (cabys_codigo);

select public.fn_adjuntar_auditoria('public.articulos');

-- === PROVEEDORES ============================================================
create table public.proveedores (
  id                       uuid primary key default gen_random_uuid(),
  cedula_juridica          text not null unique,   -- clave del match por Emisor
  nombre                   text not null,
  condicion_venta_default  text,                    -- '01' contado, '02' credito...
  plazo_credito_default    int,                     -- días
  cuenta_cxp_id            uuid references public.cuentas(id),
  estado                   text not null default 'activo' check (estado in ('activo','inactivo')),
  creado_en                timestamptz not null default now(),
  creado_por               uuid default auth.uid(),
  actualizado_en           timestamptz,
  actualizado_por          uuid
);
comment on column public.proveedores.cedula_juridica is
  'Se matchea el Emisor del XML por cédula, no por nombre (el nombre varía).';

select public.fn_adjuntar_auditoria('public.proveedores');

-- === MAPEO PROVEEDOR ↔ ARTÍCULO (aprende con el uso) ========================
-- Ancla el CodigoComercial de cada línea del proveedor a nuestro artículo, y
-- guarda la conversión de unidad de compra a unidad de stock (ej. 1 CJ = 12 BOT).
-- El tamaño de paquete solo viene en texto libre del XML, así que vive acá.
create table public.proveedor_articulos (
  id                    uuid primary key default gen_random_uuid(),
  proveedor_id          uuid not null references public.proveedores(id),
  codigo_comercial      text not null,             -- CodigoComercial de la línea
  articulo_id           uuid not null references public.articulos(id),
  unidad_compra_id      uuid not null references public.unidades(id),
  factor_a_stock        numeric(18,6) not null default 1 check (factor_a_stock > 0),
  descripcion_proveedor text,                       -- el texto libre, tal cual vino
  creado_en             timestamptz not null default now(),
  creado_por            uuid default auth.uid(),
  actualizado_en        timestamptz,
  actualizado_por       uuid,
  unique (proveedor_id, codigo_comercial)
);
comment on table public.proveedor_articulos is
  'Mapeo que aprende: la 1ª vez que aparece un CodigoComercial sin mapear, la '
  'factura queda para revisión hasta ligarlo; después entra solo.';

create index ix_prov_art_articulo on public.proveedor_articulos (articulo_id);

select public.fn_adjuntar_auditoria('public.proveedor_articulos');

do $$
declare v_u int; v_t int;
begin
  select count(*) into v_u from public.unidades;
  select count(*) into v_t from public.iva_tarifas;
  raise notice 'Catálogos Fase 3 listos: % unidades, % tarifas de IVA. empresa.cedula_juridica fijada.', v_u, v_t;
end $$;
