-- =============================================================================
-- reset_transaccional.sql — Vaciar TODA la data transaccional (arranque limpio)
-- =============================================================================
-- Borra físicamente compras, pagos, CxP, inventario, asientos e ingesta de XML,
-- y deja los saldos y consecutivos en CERO. NO toca los maestros ni la
-- configuración: proveedores, artículos, catálogo de cuentas, tarifas de IVA,
-- centros de costo, bodegas, roles, usuarios ni períodos.
--
-- PARA QUÉ SIRVE:
--   - Limpiar la data de PRUEBAS antes de arrancar la contabilidad real.
--   - Repetible: se corre cuantas veces haga falta durante la construcción.
--
-- OJO — ESTO ROMPE A PROPÓSITO LA REGLA DURA "ANULAR, NUNCA BORRAR":
--   Es un borrado físico real. Desactiva temporalmente TODOS los triggers
--   (incluidos los *_no_delete que existen justo para impedir esto) mientras
--   dura la transacción; se restauran solos al terminar. SOLO usar mientras el
--   sistema esté en construcción / pruebas. Con contabilidad real en marcha NO
--   se usa: ahí se anula, no se borra.
--
-- ANTES DE CORRERLO:
--   1. TOMÁ UN RESPALDO. Es irreversible. (Dashboard: Database > Backups, el
--      repo chepitoadm-svg/erp-chepito-backups, o un pg_dump.)
--   2. Cambiá abajo  'NO'  por  'BORRAR TODO'  en  set erp.reset_confirmar.
--   3. Corré el archivo COMPLETO en el SQL Editor del Dashboard (rol postgres)
--      o con psql contra el Session Pooler. Va todo en UNA transacción: si algo
--      falla o no queda en cero, hace rollback y no borra nada.
--
-- DESPUÉS (para arrancar la conta real, aparte de este script):
--   - Postear el asiento de APERTURA con los saldos iniciales a la fecha de
--     corte (saldos iniciales del módulo de contabilidad).
--   - Cargar las EXISTENCIAS iniciales (Inventario > Carga inicial) y conciliar
--     su total contra la cuenta 11-60-01 de la apertura.
-- =============================================================================

-- <<< CONFIRMACIÓN: cambiá 'NO' por 'BORRAR TODO' para que corra >>>
set erp.reset_confirmar = 'NO';

-- Opcional: 'SI' para también vaciar la bitácora de auditoría (cero absoluto).
-- Dejalo en 'NO' para conservar el rastro de las pruebas.
set erp.reset_auditoria = 'NO';

begin;

-- Seguro: aborta la transacción entera si no se confirmó.
do $guard$
begin
  if current_setting('erp.reset_confirmar', true) is distinct from 'BORRAR TODO' then
    raise exception
      'Reset ABORTADO. Cambiá  set erp.reset_confirmar = ''BORRAR TODO'';  y volvé a correr (con respaldo).';
  end if;
end
$guard$;

-- Apaga triggers (los *_no_delete, cuadre, auditoría y FK) solo durante esta
-- transacción; se restauran solos al hacer commit o rollback.
set local session_replication_role = replica;

-- --- Transaccional: hijos -> padres -----------------------------------------
delete from pagos_proveedor_lineas;
delete from cxp_aplicaciones;
delete from pagos_proveedor;
delete from cuentas_por_pagar;

delete from facturas_compra_otros_impuestos;
delete from facturas_compra_lineas;
delete from comprobantes_ingesta;
delete from facturas_compra;

delete from movimientos_inventario;

delete from ajustes_inventario_lineas;
delete from ajustes_inventario;
delete from recepciones_lineas;
delete from recepciones;
delete from devoluciones_compra_lineas;
delete from devoluciones_compra;
delete from cierres_inventario_lineas;
delete from cierres_inventario;
delete from ordenes_compra_lineas;
delete from ordenes_compra;
delete from transferencias_lineas;
delete from transferencias;

delete from asientos_adjuntos;
delete from asientos_anulaciones;
delete from asientos_lineas;
delete from asientos;

delete from existencias;

-- Auditoría (opcional).
do $aud$
begin
  if current_setting('erp.reset_auditoria', true) = 'SI' then
    delete from auditoria;
  end if;
end
$aud$;

-- --- Resets de saldos y consecutivos ----------------------------------------
update articulos_saldos
   set existencia_total = 0, valor_total = 0, costo_promedio = 0, actualizado_en = now();

update asientos_consecutivos set ultimo_numero = 0;

-- --- Verificación: si quedó algo, revienta y hace rollback ------------------
do $verify$
begin
  if (select count(*) from facturas_compra)        <> 0
  or (select count(*) from pagos_proveedor)        <> 0
  or (select count(*) from cuentas_por_pagar)      <> 0
  or (select count(*) from cxp_aplicaciones)       <> 0
  or (select count(*) from movimientos_inventario) <> 0
  or (select count(*) from asientos)               <> 0
  or (select count(*) from asientos_lineas)        <> 0
  or (select count(*) from existencias)            <> 0
  or (select count(*) from comprobantes_ingesta)   <> 0
  or (select count(*) from articulos_saldos
        where existencia_total <> 0 or valor_total <> 0 or costo_promedio <> 0) <> 0 then
    raise exception 'Verificación falló: quedó data transaccional. Rollback.';
  end if;
  raise notice 'Reset transaccional COMPLETO. Maestros y configuración intactos.';
end
$verify$;

commit;
