# requisitos-erp-chepito.md — Requisitos por módulo

Documento de detalle del ERP de Panaderías Chepito. El contexto general, el
stack y las **reglas duras** viven en `CLAUDE.md`; este archivo describe el
**qué** de cada módulo. Léelo junto con CLAUDE.md antes de diseñar cualquier
módulo.

> Hilo conductor: cada operación de negocio (venta, compra, producción,
> planilla) **genera automáticamente su asiento de doble partida** contra el
> catálogo de cuentas, con su centro de costo. Ese posteo automático es el
> corazón del sistema.

---

## Convenciones transversales (aplican a todos los módulos)

- Moneda base: colones (CRC). Soportar tipo de cambio para operaciones en USD.
- Todo movimiento lleva **centro de costo** (Chepito 1, Chepito 2, Taller).
- Todo registro operativo/contable: **audit trail** (usuario, fecha/hora, acción)
  y **anulación con rastro**, nunca borrado físico.
- **RLS** por rol y sucursal en cada tabla.
- Numeración consecutiva por tipo de documento, sin huecos.
- Estados de documento explícitos (borrador, aplicado, anulado).

---

## 1. Núcleo / Fundación

**Objetivo:** base sobre la que se apoyan todos los módulos.

**Entidades:** empresa, sucursales/centros de costo, bodegas, usuarios, roles,
permisos, catálogo de cuentas, periodos contables.

**Funcional:**
- Alta de empresa, sucursales y bodegas.
- Usuarios con roles (ej. cajero, bodeguero, contador, administrador) y permisos
  granulares por módulo y acción.
- Asignación de usuarios a una o varias sucursales (define su RLS).
- Catálogo de cuentas jerárquico (códigos estilo 43-10-07); marca qué cuentas
  aceptan movimiento y su naturaleza (deudora/acreedora).
- Manejo de periodos contables: abrir, cerrar, y **bloquear** para impedir
  posteos a periodos cerrados salvo permiso especial.

**Reglas:** ningún módulo puede postear a un periodo cerrado. Ningún usuario ve
datos de una sucursal que no tiene asignada.

---

## 2. Contabilidad / Mayor

**Objetivo:** el libro mayor y los estados financieros; recibe el posteo
automático de todos los demás módulos y también asientos manuales.

**Entidades:** asientos, líneas de asiento, saldos por cuenta/centro/periodo.

**Funcional:**
- Asientos manuales y automáticos, siempre con líneas de débito y crédito.
- **Validación dura:** suma débitos = suma créditos, forzada en base de datos.
  Un asiento descuadrado no se guarda.
- Saldos por cuenta, por centro de costo y por periodo.
- **Saldos iniciales / asiento de apertura:** función dedicada para arrancar a
  una fecha de corte; cada cuenta a su saldo real, la diferencia contra
  patrimonio (Capital Social 31-10 o Utilidades no distribuidas 31-50), con
  la cuenta puente Depuración Saldos Contables 31-11 para regularizaciones.
- Cierre de periodo y cierre anual (traslado de resultado a patrimonio).
- Reportes: **Balance de Comprobación**, **Estado de Resultados** y **Balance de
  Situación**, filtrables por centro de costo y periodo.
- Libro Mayor y Libro Diario.

**Reglas:** anulación de asiento genera contra-asiento con rastro, no se borra.
Los estados financieros deben cuadrar siempre (activo = pasivo + patrimonio).

---

## 3. Inventario

**Objetivo:** control de existencias de materia prima y producto terminado por
bodega, con costeo.

**Entidades:** artículos, bodegas, existencias, movimientos (kardex).

**Funcional:**
- Catálogo de artículos (materia prima, producto en proceso, producto
  terminado), con unidad de medida.
- **Kardex** por artículo y bodega (entradas, salidas, saldos).
- Valuación por **promedio ponderado**.
- Ajustes de inventario (mermas, sobrantes) con motivo y su asiento.
- **Transferencias en dos pasos** entre bodegas/sucursales: envío (sale de
  origen, queda en tránsito) y recepción (entra a destino). El inventario en
  tránsito es visible y no se pierde.
- Toma física / conteo con generación de ajuste contra el sistema.

**Contabilización:**
- Ajuste positivo: Debe Inventario / Haber Ingreso o cuenta de ajuste.
- Ajuste negativo (merma): Debe Gasto por merma / Haber Inventario.
- Las entradas y salidas por compra, venta y producción las postean sus
  respectivos módulos (ver abajo).

---

## 4. Compras

**Objetivo:** ciclo completo de abastecimiento, ligado a inventario y CxP.

**Entidades:** proveedores, órdenes de compra, recepciones, facturas de compra.

**Funcional:**
- Catálogo de proveedores (Dos Pinos, PriceSmart, Distribuidora Universal de
  Alimentos, etc.).
- Orden de compra → recepción de mercadería → factura de compra.
- La **recepción** ingresa al inventario y actualiza el costo promedio.
- Registro del IVA acreditable de la compra.
- Cuentas por pagar generadas desde la factura de compra.

**Contabilización (compra a crédito):**
- Debe Inventario (costo)
- Debe IVA crédito (acreditable)
- Haber Cuentas por Pagar (proveedor)
  (Si es de contado, Haber Caja/Bancos en lugar de CxP.)

---

## 5. Producción

**Objetivo:** convertir materia prima en producto terminado con costeo real.

**Entidades:** recetas (BOM), órdenes de producción, consumos.

**Funcional:**
- **Recetas / BOM** por producto: qué materias primas y en qué cantidad.
- Órdenes de producción con **explosión de materiales**: calcula la materia
  prima requerida según la cantidad a producir.
- Al cerrar la orden: consume materia prima (sale de inventario) e ingresa
  producto terminado (entra a inventario), costeado.
- Costeo por producto: costo de materia prima; opción de incluir mano de obra y
  costos indirectos (CIF) si se desea afinar.
- Producción cargada al centro de costo **Taller**.

**Contabilización:**
- Debe Inventario producto terminado
- Haber Inventario materia prima
  (más MO/CIF si se costean, contra sus cuentas de gasto/aplicación).

---

## 6. Ventas y POS (offline-first)

**Objetivo:** punto de venta de las sucursales; **reemplaza QuPOS**.

**Entidades:** ventas, líneas de venta, sesiones/turnos de caja.

**Funcional:**
- POS ágil para Chepito 1 y Chepito 2.
- **Offline-first:** la caja sigue vendiendo sin internet y **sincroniza** al
  recuperar conexión. Requisito duro, la venta diaria no puede parar.
- Ventas de contado y a crédito.
- Apertura/cierre de turno de caja con arqueo.
- Descuento de inventario en tiempo real (producto terminado).
- Integración con **facturación electrónica** (ver módulo 15).

**Contabilización (venta de contado):**
- Debe Caja/Bancos (total con IVA)
- Haber Ventas (neto), por centro de costo
- Haber IVA débito (por pagar)
- Y el costo: Debe Costo de Ventas / Haber Inventario (al costo promedio)
  (Si es a crédito, Debe Cuentas por Cobrar en lugar de Caja.)

---

## 7. Mayoreo

**Objetivo:** ventas al por mayor con logística propia.

**Entidades:** clientes mayoreo, pedidos, entregas, devoluciones.

**Funcional:**
- Clientes de mayoreo con sus condiciones (crédito, lista de precios).
- Pedidos → entregas (rutas/despachos) → devoluciones.
- Las devoluciones reingresan inventario y revierten la venta.
- Ligado a CxC (facturación a crédito) y a listas de precios de mayoreo.

**Contabilización:** igual que venta a crédito; la devolución genera el asiento
inverso proporcional.

---

## 8. Cuentas por Cobrar (CxC)

**Objetivo:** control de lo que deben los clientes.

**Funcional:**
- Saldos por cliente, documentos por cobrar.
- **Antigüedad de saldos** (aging) por rangos de días.
- Aplicación de pagos/abonos a documentos.
- Estados de cuenta por cliente.

**Contabilización (cobro):** Debe Caja/Bancos / Haber Cuentas por Cobrar.

---

## 9. Cuentas por Pagar (CxP)

**Objetivo:** control de lo que se debe a proveedores.

**Funcional:**
- Saldos por proveedor, documentos por pagar.
- **Antigüedad de saldos** por rangos de días.
- Programación y registro de pagos.

**Contabilización (pago):** Debe Cuentas por Pagar / Haber Caja/Bancos.

---

## 10. Tesorería / Bancos

**Objetivo:** control de cuentas bancarias y conciliación **con datos reales**.

**Entidades:** cuentas bancarias, movimientos de banco, conciliaciones.

**Funcional:**
- Cuentas bancarias mapeadas al catálogo (estilo 11-10-15-04-01).
- **Importación de estados de cuenta reales** del banco.
- Conciliación: casar movimientos de libros contra los del banco importado.
- Partidas conciliatorias (depósitos en tránsito, cheques girados no cobrados)
  identificadas, no forzadas.
- Cierre de conciliación solo cuando la diferencia contra el banco real es cero.

**Regla clave (aprendida a la mala):** la conciliación se hace contra el estado
de cuenta **real** importado, nunca contra saldos "generados" por el sistema. El
saldo en libros debe casar con el banco de verdad.

---

## 11. Caja chica y arqueos

**Objetivo:** control de efectivo menor y verificación de caja.

**Funcional:**
- Fondos de caja chica por sucursal.
- Registro de gastos menores con comprobante y reembolso del fondo.
- **Arqueos** de caja (conteo vs saldo del sistema) con registro de diferencias.

**Contabilización (reembolso):** Debe Gastos varios (por centro de costo) /
Haber Caja/Bancos. Las diferencias de arqueo van a una cuenta de sobrantes/
faltantes.

---

## 12. Listas de precios

**Objetivo:** precios diferenciados con trazabilidad.

**Funcional:**
- Múltiples listas (detalle, mayoreo, por cliente).
- **Historial de precios:** guardar vigencias, no sobrescribir. Poder consultar
  qué precio estaba vigente a una fecha.

---

## 13. Planilla / RRHH

**Objetivo:** pago de personal con las obligaciones de Costa Rica.

**Entidades:** empleados, planillas, movimientos (incapacidades, extras),
provisiones.

**Funcional:**
- Empleados con su centro de costo y si están **reportados a la CCSS** o no.
- Cálculo de planilla: salario, deducciones y **cargas patronales solo para los
  reportados a la Caja** (según tasas CCSS vigentes).
- Manejo de **incapacidades** (CCSS/INS) y horas extra.
- **Provisiones mensuales:** aguinaldo, cesantía y vacaciones.
- **Reparto por centro de costo:** personal de producción al Taller; personal de
  venta repartido entre sucursales (regla configurable).

**Contabilización (planilla):**
- Debe Gasto de salarios y Debe Gasto cargas patronales (por centro de costo)
- Haber Salarios por pagar, Haber CCSS por pagar, Haber retenciones por pagar
- Provisiones: Debe Gasto aguinaldo/cesantía/vacaciones / Haber Provisión
  respectiva.

---

## 14. Activos fijos

**Objetivo:** control de equipo (hornos, mobiliario) y su depreciación.

**Funcional:**
- Registro de activos: costo, fecha, vida útil, centro de costo.
- Cálculo de **depreciación** periódica.

**Contabilización (depreciación):** Debe Gasto por depreciación / Haber
Depreciación acumulada.

---

## 15. Facturación electrónica (integración externa)

**Objetivo:** cumplir con Hacienda **sin construir la parte fiscal internamente**.

**Funcional:**
- Integración por **API con un proveedor certificado** de facturación
  electrónica 4.4.
- El ERP envía los datos de la venta; el proveedor genera el XML, lo firma y lo
  valida contra Hacienda (TRIBU-CR) y devuelve el comprobante aceptado.
- Manejo de estados: aceptado / rechazado / pendiente; reintentos.
- Soporte de tipos de comprobante requeridos (factura, tiquete, nota de
  crédito/débito, y REP cuando aplique).

**Regla dura:** NO construir el XML, la firma digital, ni la lógica de CAByS
dentro del ERP. Solo consumir el servicio del proveedor. Esta es la pieza más
riesgosa para hacer a mano y por eso se delega.

---

## 16. Presupuesto vs real

**Objetivo:** control de gestión.

**Funcional:**
- Cargar presupuesto por cuenta y centro de costo por periodo.
- Comparar presupuesto contra ejecutado, con variaciones.

---

## 17. Reportería / Power BI

**Objetivo:** análisis y tableros.

**Funcional:**
- **Vistas de base de datos** pensadas para consumir desde Power BI.
- Reportes clave: ventas por sucursal, márgenes, P&L por centro de costo,
  antigüedad de CxC/CxP, rotación de inventario, costos de producción.

---

## Orden sugerido de construcción

Sigue las fases del `CLAUDE.md`: Fundación → Contabilidad → Inventario + Compras
→ Producción → Ventas/POS offline-first → (Planilla, Mayoreo, Caja chica,
Presupuesto, Reportería) → cutover.

No construir todo de una. Un módulo (o rebanada vertical) por sesión, con plan y
esquema aprobados antes de codear.
