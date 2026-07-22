# CLAUDE.md — ERP Panaderías Chepito

Este archivo es el contexto persistente del proyecto. **Léelo completo al
inicio de cada sesión** antes de proponer o escribir código.

---

## Qué es este proyecto

ERP a la medida para **Panaderías Chepito** (razón social COMERCIALIZADORA Y
PANADERIA CHEPIT S.A.), Costa Rica. Reemplaza herramientas dispersas (apps
sueltas, el POS QuPOS, contabilidad externa desordenada) por un sistema
unificado, multiusuario y multisucursal, con contabilidad de doble partida
integrada.

---

## Contexto del negocio

- Panadería con **producción propia** y venta **al detalle** y **al por mayor**
  (mayoreo).
- La operación son **3 centros de costo**:
  - **Chepito 1** — sucursal / punto de venta
  - **Chepito 2** — sucursal / punto de venta
  - **Taller** — producción centralizada que abastece a ambas sucursales
- Proveedores recurrentes: Dos Pinos, PriceSmart, Distribuidora Universal de
  Alimentos.
- País: Costa Rica. Implica CCSS, aguinaldo, cesantía, vacaciones, IVA y
  facturación electrónica de Hacienda.

---

## Stack

- **Frontend:** Next.js
- **Backend / DB:** Supabase (Postgres) con Auth y Row Level Security (RLS)
- Multiusuario, multisucursal
- Repo git; despliegue por definir
- **Esquema versionado con migraciones SQL de Supabase.** Nunca cambios ad-hoc
  en el dashboard.

---

## Reglas duras (NO negociables)

Aplican en TODOS los módulos, siempre:

1. **Doble partida:** todo asiento debe cuadrar (suma débitos = suma créditos).
   Forzado a nivel de base de datos (constraints/triggers o un servicio de
   posteo transaccional), NO solo validado en el frontend.
2. **Integridad en la base, no en la pantalla.** Un saldo imposible o un asiento
   descuadrado debe ser *imposible* de guardar.
3. **Anular, nunca borrar.** Ningún registro contable u operativo se elimina
   físicamente; se anula dejando rastro. Borrado físico prohibido.
4. **Rastro de auditoría** en todas las tablas relevantes: quién, cuándo, qué
   cambió.
5. **Bloqueo de periodos:** no se puede postear a un periodo contable cerrado
   sin permiso especial.
6. **Saldos iniciales / asiento de apertura como función de primera clase:**
   arranque limpio a una fecha de corte, cada cuenta a su saldo real, diferencia
   contra patrimonio.
7. **RLS desde el día uno:** cada usuario ve y toca solo lo de su rol y su(s)
   sucursal(es).

---

## Contabilidad

- Catálogo de cuentas con **códigos jerárquicos** (estilo 43-10-07 /
  31-10-00-00-00 / 11-10-15-04-01).
- **Posteo automático** desde las operaciones (ventas, compras, planilla,
  producción) hacia el mayor.
- **Centros de costo** por canal (Chepito 1, Chepito 2, Taller).
- Manejo de préstamos, depreciación de activos fijos y saldos iniciales.
- Produce **Estado de Resultados** y **Balance de Situación**.
- Cuentas de patrimonio ya definidas: Capital Social (31-10), Depuración Saldos
  Contables (31-11, cuenta puente de regularización), Utilidades no distribuidas
  (31-50), Pérdidas y ganancias del periodo (31-90).

---

## Costa Rica — fiscal

- **Facturación electrónica versión 4.4** (obligatoria, validada en tiempo real
  por Hacienda vía API) e integración con **TRIBU-CR** (declaraciones
  prellenadas).
- **IMPORTANTE:** la facturación electrónica (XML, firma digital, validación,
  REP, CAByS) se integra vía un **PROVEEDOR CERTIFICADO EXTERNO por API**. NO
  construir el XML ni la firma digital dentro de este ERP. El ERP solo consume
  ese servicio.
- **Planilla CR:** CCSS (solo algunos empleados reportados a la Caja, con
  deducciones y cargas patronales únicamente para esos), aguinaldo, cesantía,
  vacaciones, incapacidades.
- **Reparto de planilla por centro de costo:** el personal de producción se
  carga al Taller; el personal de venta se reparte entre las sucursales. Es una
  regla **configurable**, no hardcodeada.

---

## Alcance / módulos

(El detalle fino vive en `requisitos-erp-chepito.md`; aquí el mapa.)

- **Contabilidad y mayor:** doble partida, cierres, saldos iniciales, estados
  financieros.
- **Inventario:** kardex y valuación por **promedio ponderado**; transferencias
  en **dos pasos** entre bodegas/sucursales.
- **Compras:** ciclo completo (orden, recepción, ligado a CxP e inventario).
- **Producción:** planeación con **explosión de materiales (BOM)**, costeo por
  producto.
- **Ventas y POS:** offline-first, reemplaza QuPOS (ver sección aparte).
- **Mayoreo:** clientes, entregas, devoluciones.
- **CxC y CxP** con antigüedad de saldos.
- **Tesorería / bancos:** conciliación contra estados de cuenta **reales
  importados** (nada de saldos generados por un botón).
- **Caja chica y arqueos.**
- **Listas de precios** con historial.
- **Planilla / RRHH** con provisiones (aguinaldo, cesantía, vacaciones).
- **Presupuesto vs real.**
- **Vistas para Power BI** / reportería.

---

## POS offline-first (requisito duro)

- El POS **reemplaza QuPOS**. La continuidad de venta diaria es un requisito
  duro.
- La caja **DEBE poder seguir vendiendo sin internet** y sincronizar cuando
  vuelva la conexión.

---

## Cómo trabajamos (convenciones de desarrollo)

1. Antes de codear cualquier módulo, **propón un plan y el diseño del esquema, y
   DETENTE para aprobación.**
2. **Un módulo (o una rebanada vertical) por sesión.** Nada de big bang.
3. Cada cambio de esquema es una **migración SQL versionada**.
4. **Commit git** por cada incremento que funcione.
5. Al cerrar cada tarea, deja el **criterio de verificación** ("debo poder hacer
   X").
6. Respeta siempre las **reglas duras** de arriba.

---

## Plan por fases

1. **Fundación:** scaffold, esquema base (empresa, sucursales/centros de costo,
   usuarios/roles, catálogo de cuentas), Auth + RLS, y una entidad de punta a
   punta como patrón de referencia.
2. **Contabilidad:** mayor, doble partida forzada, saldos iniciales, cierres,
   estados financieros.
3. **Inventario + Compras:** kardex, promedio ponderado, ciclo de compra,
   transferencias en dos pasos.
4. **Producción:** BOM, explosión de materiales, costeo.
5. **Ventas + POS offline-first** (reemplazo de QuPOS).
6. **Cierre de alcance:** planilla, mayoreo, caja chica, presupuesto,
   reportería Power BI, y cutover final.

---

## Estado actual

- Este CLAUDE.md es la **fuente de verdad**; manténlo actualizado con cada
  decisión de arquitectura que se tome.
- **Fase 1 (Fundación): código escrito y commiteado**, pendiente de instalar y
  probar en una máquina con salida de red (ver nota de entorno abajo).

### Decisiones de arquitectura fijadas (Fase 1)

- **Stack:** Next.js App Router + TypeScript, `@supabase/ssr` (Auth por
  cookies), Tailwind v4, Zod, react-hook-form. Migraciones con la Supabase CLI.
- **DB:** Supabase en la **nube**, proyecto nuevo y exclusivo (sin Docker).
- **Esquema en español.** Sucursal = centro de costo unificado (tabla
  `sucursales` con `tipo`). Un rol por usuario (M:N roles↔permisos para roles a
  medida).
- **Auditoría:** trigger genérico `fn_auditoria` → tabla `auditoria` (inmutable).
  Columnas `creado_*/actualizado_*` en cada tabla.
- **Anular, nunca borrar:** sin políticas de DELETE; baja = `estado`.
- **RLS** en todas las tablas con `(select auth.uid())` y helpers `STABLE`
  `SECURITY DEFINER` (`mis_sucursales`, `soy_administrador`, `tengo_permiso`,
  `comparte_sucursal_con`). Lectura por sucursal, escritura por permiso.
- **Operaciones sensibles en el servidor:** crear usuarios de Auth usa el
  cliente `service_role` en Server Actions, siempre tras `requerirPermiso`.
- **Catálogo de cuentas:** semilla mínima (patrimonio); el completo se importa
  luego desde xlsx.
- **Patrón de referencia:** gestión de usuarios de punta a punta (migración →
  RLS → capa de datos → Server Actions → UI). Replicar en los demás módulos.

### Nota de entorno

- En la compu del trabajo, `node.exe` **no tiene salida de red** (firewall
  corporativo; PowerShell sí). Por eso no se puede `npm install` / `npm run dev`
  / `supabase db push` ahí. El código se escribe en esa máquina y se
  instala/prueba/pushea en otra con red. Arreglo de fondo: whitelist de red
  para `node.exe`.
- Verificación de la Fase 1 y pasos de arranque: ver `README.md`.
