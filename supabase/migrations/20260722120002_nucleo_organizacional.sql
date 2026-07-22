-- =============================================================================
-- 20260722120002_nucleo_organizacional.sql
-- Empresa, sucursales (= centros de costo), bodegas, catálogo de cuentas y
-- periodos contables. Núcleo sobre el que se montan los módulos de negocio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Empresa (razón social). Una sola fila operativa.
-- -----------------------------------------------------------------------------
create table public.empresa (
  id              uuid primary key default gen_random_uuid(),
  razon_social    text not null,
  nombre_comercial text,
  cedula_juridica text,
  moneda_base     char(3) not null default 'CRC',
  estado          text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);

comment on table public.empresa is 'Datos de la razón social (COMERCIALIZADORA Y PANADERIA CHEPIT S.A.).';

-- -----------------------------------------------------------------------------
-- Sucursales = centros de costo. Los 3 de la operación (Chepito 1, Chepito 2,
-- Taller). El `tipo` distingue punto de venta vs producción vs administración.
-- -----------------------------------------------------------------------------
create table public.sucursales (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nombre          text not null,
  tipo            text not null check (tipo in ('punto_venta', 'produccion', 'administracion')),
  estado          text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);

comment on table public.sucursales is 'Sucursales / centros de costo. Eje de imputación de todo movimiento y base del RLS por sucursal.';

-- -----------------------------------------------------------------------------
-- Bodegas: almacenes físicos, pertenecen a una sucursal. Una sucursal puede
-- tener varias (ej. Taller: materia prima + producto terminado).
-- -----------------------------------------------------------------------------
create table public.bodegas (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references public.sucursales(id),
  codigo          text not null,
  nombre          text not null,
  tipo            text not null check (tipo in ('materia_prima', 'producto_terminado', 'general')),
  estado          text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid,
  unique (sucursal_id, codigo)
);

comment on table public.bodegas is 'Almacenes por sucursal. Base del kardex e inventario (fases posteriores).';

-- -----------------------------------------------------------------------------
-- Catálogo de cuentas jerárquico (códigos estilo 31-10). Solo las hojas
-- (acepta_movimiento = true) reciben asientos; los padres agrupan.
-- -----------------------------------------------------------------------------
create table public.cuentas (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nombre            text not null,
  cuenta_padre_id   uuid references public.cuentas(id),
  nivel             int not null check (nivel >= 1),
  tipo              text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  naturaleza        text not null check (naturaleza in ('deudora', 'acreedora')),
  acepta_movimiento boolean not null default false,
  estado            text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  actualizado_en    timestamptz,
  actualizado_por   uuid
);

comment on table public.cuentas is 'Catálogo de cuentas jerárquico. Semilla mínima; el catálogo completo se importa luego desde xlsx.';
comment on column public.cuentas.acepta_movimiento is 'Solo las cuentas hoja aceptan movimiento; un padre nunca recibe asientos directos.';

create index cuentas_padre_idx on public.cuentas (cuenta_padre_id);

-- -----------------------------------------------------------------------------
-- Periodos contables: soporte del bloqueo de periodos (regla dura #5).
-- El motor de asientos (Fase 2) impedirá postear a periodos cerrados/bloqueados.
-- -----------------------------------------------------------------------------
create table public.periodos_contables (
  id              uuid primary key default gen_random_uuid(),
  anio            int not null,
  mes             int not null check (mes between 1 and 12),
  fecha_inicio    date not null,
  fecha_fin       date not null,
  estado          text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'bloqueado')),
  cerrado_por     uuid,
  cerrado_en      timestamptz,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid,
  unique (anio, mes),
  check (fecha_fin >= fecha_inicio)
);

comment on table public.periodos_contables is 'Periodos contables abrir/cerrar/bloquear. Ningún módulo postea a un periodo no abierto salvo permiso especial.';

-- -----------------------------------------------------------------------------
-- Audit trail + timestamps en todas las tablas del núcleo.
-- -----------------------------------------------------------------------------
select public.fn_adjuntar_auditoria('public.empresa');
select public.fn_adjuntar_auditoria('public.sucursales');
select public.fn_adjuntar_auditoria('public.bodegas');
select public.fn_adjuntar_auditoria('public.cuentas');
select public.fn_adjuntar_auditoria('public.periodos_contables');
