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
- **Códigos de cuenta: 5 segmentos fijos `NN-NN-NN-NN-NN`.** El `nivel` es el
  número de segmentos distintos de `00`. El catálogo real (371 cuentas) se
  importa desde xlsx; el árbol está completo y `cuenta_padre_id` se deriva del
  código.
- Cuentas de patrimonio y **a cuál se postea de verdad** (la agrupadora no
  acepta movimiento):

  | Concepto | Agrupadora | **Cuenta posteable** |
  |---|---|---|
  | Capital Social | `31-10-00-00-00` (no acepta) | **`31-10-01-00-00` Acciones comunes** |
  | Depuración Saldos Contables | — | **`31-11-00-00-00`** |
  | Utilidades no distribuidas | — | **`31-50-00-00-00`** |
  | Pérdidas y ganancias del periodo | — | **`31-90-00-00-00`** |

- **Cuentas de orden** (`99-*`, tipo `orden`): son de memorando. Un asiento no
  puede mezclarlas con cuentas reales, cuadran contra su propia contrapartida,
  no llevan centro de costo y **se excluyen** del Balance y del Estado de
  Resultados.

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
- **Fase 1 (Fundación): COMPLETADA Y VERIFICADA** (2026-07-22) contra un
  proyecto Supabase real (`ERP Chepito`, ref `iwtbfdrchzqcrewiaiua`). Los 5
  puntos del criterio de verificación pasaron: login del admin, alta de un
  cajero con rol y sucursal, edición, desactivación (sin borrado físico),
  aislamiento por rol/sucursal, y rastro en `auditoria`.
- **Siguiente: Fase 2 (Contabilidad).** Antes de codear, proponer plan y diseño
  de esquema y DETENERSE para aprobación (convención #1).

### Decisiones de arquitectura fijadas (Fase 1)

- **Stack:** Next.js App Router + TypeScript, `@supabase/ssr` (Auth por
  cookies), Tailwind v4, Zod, react-hook-form. Migraciones con la Supabase CLI.
- **DB:** Supabase en la **nube**, proyecto nuevo y exclusivo (sin Docker).
- **Esquema en español.** Un rol por usuario (M:N roles↔permisos para roles a
  medida).
- ~~Sucursal = centro de costo unificado~~ **SUPERADO en Fase 2:** los centros
  de costo son su propia tabla extensible (`centros_costo`), porque "Venta
  externa" y "General" no son sucursales físicas y el Taller es un acumulador
  intermedio. Ver sección de Fase 2.
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

### Decisiones fijadas (Fase 2 — Contabilidad)

- **Marco legal (DGT-R-001-2013).** Los libros contables ya no requieren
  legalización y pueden llevarse en el sistema que el contribuyente elija,
  siempre que garantice **la seguridad y fiabilidad del registro**. Este ERP
  puede ser legalmente el sistema contable de la sociedad; no hace falta
  software certificado. **Consecuencia dura:** la inmutabilidad del asiento
  confirmado, la bitácora de auditoría, la ausencia de DELETE y la anulación por
  reversión **no son preferencias de diseño, son lo que sostiene esa
  fiabilidad**. No se simplifican si estorban. Contabilidad en español y
  conforme a NIIF.
- **Centros de costo:** tabla propia `centros_costo`, extensible sin migración.
  Dos tipos: **finales** (Chepito 1, Chepito 2, Venta externa) que salen en el
  Estado de Resultados por canal, e **intermedios** (Taller, General) que
  acumulan gasto compartido y se reparten a fin de mes. Toda línea de cuenta de
  resultado exige centro; las de balance lo dejan en NULL. El inventario por
  bodega es del módulo de inventario, **no** se mezcla con el centro de costo.
- **Prorrateo:** es un asiento (`tipo='prorrateo'`), no un reporte. Se hace
  **cuenta por cuenta** para conservar el detalle de gastos por canal. Regla de
  redondeo obligatoria: las primeras n-1 líneas se redondean y **la última
  absorbe el residuo**, por cuenta. Las bases suman 100 exacto, sin excepción.
  Nace en `borrador` para revisarlo antes de confirmar.
- **Doble partida:** `CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED` sobre
  `asientos_lineas` **y** sobre `asientos` (este segundo es imprescindible: sin
  él se confirma un descuadre con un simple `UPDATE estado`). Valida solo cuando
  el asiento queda `confirmado`. Estados:
  `borrador → confirmado → anulado`, más `descartado` para borradores resueltos
  al cerrar un periodo. El consecutivo se asigna **al confirmar**, no al crear.
- **Fecha contable:** `asientos.fecha` es `DATE`, nunca `timestamptz` (CR es
  UTC-6; una venta de las 7pm del 30 de junio caería en julio). Las marcas de
  auditoría sí son `timestamptz`.
- **Montos:** `NUMERIC(18,2)` siempre. Nunca `float`.
- **Idempotencia:** índice único sobre `(origen_tipo, origen_id)`. El POS es
  offline-first y puede sincronizar dos veces la misma venta.
- **RLS de contabilidad: por permiso, no por sucursal.** Filtrar líneas por
  sucursal mostraría medio asiento, que por definición no cuadra.
- **Respaldos (decidido 2026-07-22):** NO se sube a Pro todavía. Se monta
  respaldo propio con `pg_dump` diario vía GitHub Actions a repo privado, con
  verificación de integridad, usando el **Session Pooler** (la Direct es IPv6 y
  los runners de GitHub son IPv4; la Transaction del 6543 rompe el `COPY` de
  `pg_dump`). Riesgo asumido: hasta 24 h de datos de construcción, todo
  reconstruible. **Disparador de revisión: el arranque del POS en producción**
  — ahí se sube a Pro y se valora PITR. Un día de ventas del POS no se
  reconstruye.

### Libros contables obligatorios (CR)

Son tres: **Diario**, **Mayor** e **Inventarios y Balances**. Los dos primeros
salen del motor de Fase 2. El tercero **se parte en dos mitades**:

- **Balances** (Balance de Situación y Estado de Resultados al cierre del
  periodo fiscal): **entra en Fase 2**, expuesto como reporte de cierre con su
  fecha y formato. Las vistas ya están en el alcance de la fase; diferirlo
  obligaría a volver a tocar en Fase 3 algo ya construido.
- **Inventarios** (detalle valuado por ítem): **se difiere a Fase 3**, porque
  sin kardex con promedio ponderado no hay contenido que mostrar.

**Condiciones de la mitad diferida:**

1. **Fase 3 debe estar lista antes del cierre del periodo fiscal.** Si no
   llega, el respaldo es el **conteo físico documentado**.
2. El **conteo físico del 30/06/2026** que originó el asiento de apertura ya
   cumple esa función **para esa fecha**: es respaldo válido del inventario a
   esa fecha.
3. **La fecha del cierre fiscal está sin confirmar.** NO darla por sentada ni
   escribirla acá hasta que se confirme cuál le aplica a la sociedad.

### Nota de entorno

- En la compu del trabajo, `node.exe` **no tiene salida de red** (firewall
  corporativo; PowerShell sí). Por eso no se puede `npm install` / `npm run dev`
  / `supabase db push` ahí. El código se escribe en esa máquina y se
  instala/prueba/pushea en otra con red. Arreglo de fondo: whitelist de red
  para `node.exe`.
- **TLS interceptado (resuelto).** En la máquina de pruebas, un antivirus o
  firewall re-firma el tráfico HTTPS con su propia CA raíz. Windows confía,
  pero Node usa su propio almacén y rechazaba **todo** HTTPS
  (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), lo que se manifestaba como
  `fetch failed` y mensajes engañosos ("Credenciales inválidas", botones que
  "no hacen nada"). Por eso los scripts `dev` y `start` corren
  `node --use-system-ca`. **Si algo falla con `fetch failed`, sospechar esto
  primero.**
- **Conexión a la base:** la opción "Direct connection" de Supabase **no sirve**
  en esta red (`db.<ref>.supabase.co` solo resuelve a IPv6). Hay que usar el
  **Session pooler** (`aws-1-us-west-2.pooler.supabase.com:5432`, usuario
  `postgres.<ref>`).
- **Llaves de API:** el proyecto usa el formato nuevo de Supabase
  (`sb_publishable_` / `sb_secret_`), soportado por supabase-js 2.110+. Los
  nombres de las variables de entorno se mantienen (`..._ANON_KEY`,
  `..._SERVICE_ROLE_KEY`); solo cambia el valor.
- Verificación de la Fase 1 y pasos de arranque: ver `README.md`.
