-- =============================================================================
-- seed.sql — Datos base del ERP Chepito.
-- Idempotente: se puede correr varias veces sin duplicar (ON CONFLICT / WHERE
-- NOT EXISTS). NO crea usuarios de Auth (eso se hace aparte; ver
-- supabase/scripts/bootstrap_admin.sql).
-- =============================================================================

-- === EMPRESA ================================================================
insert into public.empresa (razon_social, nombre_comercial, cedula_juridica)
select 'COMERCIALIZADORA Y PANADERIA CHEPIT S.A.', 'Panaderías Chepito', null
where not exists (select 1 from public.empresa);

-- === SUCURSALES / CENTROS DE COSTO ==========================================
insert into public.sucursales (codigo, nombre, tipo) values
  ('CH1', 'Chepito 1', 'punto_venta'),
  ('CH2', 'Chepito 2', 'punto_venta'),
  ('TAL', 'Taller',    'produccion')
on conflict (codigo) do nothing;

-- === BODEGAS ================================================================
-- Taller: materia prima + producto terminado. Cada sucursal: una bodega general.
insert into public.bodegas (sucursal_id, codigo, nombre, tipo)
select s.id, v.codigo, v.nombre, v.tipo
from (values
  ('TAL', 'MP',  'Materia Prima - Taller',      'materia_prima'),
  ('TAL', 'PT',  'Producto Terminado - Taller', 'producto_terminado'),
  ('CH1', 'GEN', 'Bodega Chepito 1',            'general'),
  ('CH2', 'GEN', 'Bodega Chepito 2',            'general')
) as v(suc, codigo, nombre, tipo)
join public.sucursales s on s.codigo = v.suc
on conflict (sucursal_id, codigo) do nothing;

-- === ROLES ==================================================================
insert into public.roles (codigo, nombre, descripcion, es_sistema) values
  ('administrador', 'Administrador', 'Acceso total al sistema',          true),
  ('contador',      'Contador',      'Contabilidad, cuentas y reportes', true),
  ('cajero',        'Cajero',        'Punto de venta',                   true),
  ('bodeguero',     'Bodeguero',     'Inventario y bodegas',             true)
on conflict (codigo) do nothing;

-- === PERMISOS ===============================================================
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('usuarios',   'ver',      'usuarios.ver',       'Ver usuarios'),
  ('usuarios',   'crear',    'usuarios.crear',     'Crear usuarios'),
  ('usuarios',   'editar',   'usuarios.editar',    'Editar usuarios y sus asignaciones'),
  ('usuarios',   'anular',   'usuarios.anular',    'Activar / desactivar usuarios'),
  ('sucursales', 'gestionar','sucursales.gestionar','Crear y editar sucursales'),
  ('bodegas',    'gestionar','bodegas.gestionar',  'Crear y editar bodegas'),
  ('cuentas',    'gestionar','cuentas.gestionar',  'Gestionar el catálogo de cuentas'),
  ('periodos',   'gestionar','periodos.gestionar', 'Abrir / cerrar / bloquear periodos'),
  ('roles',      'gestionar','roles.gestionar',    'Gestionar roles y permisos'),
  ('empresa',    'gestionar','empresa.gestionar',  'Editar datos de la empresa'),
  ('auditoria',  'ver',      'auditoria.ver',      'Consultar el rastro de auditoría')
on conflict (codigo) do nothing;

-- === ASIGNACIÓN DE PERMISOS A ROLES =========================================
-- Administrador: todos los permisos (además el helper soy_administrador() lo
-- cubre, pero lo dejamos explícito).
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.codigo = 'administrador'
on conflict do nothing;

-- Contador: cuentas, periodos, auditoría y ver usuarios.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.codigo in
  ('cuentas.gestionar', 'periodos.gestionar', 'auditoria.ver', 'usuarios.ver')
where r.codigo = 'contador'
on conflict do nothing;

-- Bodeguero: gestionar bodegas.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.codigo in ('bodegas.gestionar')
where r.codigo = 'bodeguero'
on conflict do nothing;

-- Cajero: sin permisos administrativos por ahora (venderá en Fase 5).

-- === CATÁLOGO DE CUENTAS (semilla mínima) ===================================
-- Solo el subárbol de Patrimonio definido en CLAUDE.md. El catálogo completo
-- se importará luego desde xlsx.
insert into public.cuentas (codigo, nombre, cuenta_padre_id, nivel, tipo, naturaleza, acepta_movimiento)
select '31', 'Patrimonio', null, 1, 'patrimonio', 'acreedora', false
where not exists (select 1 from public.cuentas where codigo = '31');

insert into public.cuentas (codigo, nombre, cuenta_padre_id, nivel, tipo, naturaleza, acepta_movimiento)
select v.codigo, v.nombre, padre.id, 2, 'patrimonio', 'acreedora', true
from (values
  ('31-10', 'Capital Social'),
  ('31-11', 'Depuración de Saldos Contables'),
  ('31-50', 'Utilidades no Distribuidas'),
  ('31-90', 'Pérdidas y Ganancias del Periodo')
) as v(codigo, nombre)
join public.cuentas padre on padre.codigo = '31'
on conflict (codigo) do nothing;

-- === PERIODO CONTABLE ABIERTO (mes en curso) ================================
insert into public.periodos_contables (anio, mes, fecha_inicio, fecha_fin, estado)
values (2026, 7, '2026-07-01', '2026-07-31', 'abierto')
on conflict (anio, mes) do nothing;
