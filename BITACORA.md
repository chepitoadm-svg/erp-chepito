# Bitácora — ERP Chepito

Registro vivo para trabajar desde **dos computadoras** (casa y trabajo) sin perder nada
y sin hacer desmadre. Este archivo viaja con el código en GitHub, así que lo ves igual
en las dos máquinas.

---

## Cómo NO perder el trabajo (leer esto)

Tu trabajo vive en **dos nubes**, no en las compus:

1. **El CÓDIGO → GitHub** (`chepitoadm-svg/erp-chepito`). Es la fuente única.
2. **Los DATOS → Supabase** (la base en la nube). Las dos compus pegan a la MISMA base,
   así que lo que se cambia en los datos se ve igual en las dos al instante. No hay nada
   que sincronizar ahí.

Si una compu se daña o tu mamá la usa, **no pasa nada**: todo está en GitHub + Supabase.

### Rutina (hacela siempre)

- **Al EMPEZAR** en cualquier compu:  `git pull`
- **Al TERMINAR**:  `git add -A`  →  `git commit -m "qué hice"`  →  `git push`
- **Regla de oro:** nunca te cambiés de compu con cosas sin subir. Si dejás algo a
  medias, igual lo commiteás (ej. `git commit -m "WIP: a medias X"`) y lo subís; en la
  otra compu `git pull` y seguís donde quedaste.

### Sincronización automática (hooks)

En la compu de CASA ya está configurado para que **solo**: al iniciar sesión baja de
GitHub (`git pull`) y al terminar cada respuesta sube (`git add/commit/push`). Está
en `~/.claude/settings.json` (hooks SessionStart y Stop). **Ese archivo NO se
sincroniza por git** (es de cada máquina), así que en la compu del TRABAJO hay que
configurarlo una vez: pedile a Claude *"configurá el auto-sync de git igual que en casa"*
(ajustando la ruta del repo de esa máquina). Igual, aunque no esté el hook, Claude
sube/baja al pedírselo.

### Cómo arrancar en la compu del TRABAJO (con Claude Code)

No hace falta escribir comandos: se le pide a Claude en palabras normales.

**Primera vez (si el proyecto no está bajado allá):**
1. Abrir la app de Claude Code y empezar en cualquier carpeta (ej. Documentos).
2. Decirle a Claude: `cloná https://github.com/chepitoadm-svg/erp-chepito.git en esta carpeta`
3. Queda la carpeta `erp-chepito`. Abrirla como proyecto (o "trabajemos en erp-chepito").

**Siguientes veces (ya bajado):**
1. Abrir Claude Code → abrir la carpeta `erp-chepito` (sale en recientes).
2. Decir: **"traé lo último"** (git pull).
3. Bretear. Al terminar: **"subí todo"** (git push).

Claude lee `CLAUDE.md` y este `BITACORA.md` solo al arrancar, así sabe en qué vamos.

### Ojo con la compu del TRABAJO

- Ahí `node` NO tiene salida a internet (firewall). PowerShell y git SÍ.
- Entonces en el trabajo podés **escribir código y hacer `git push`**, pero NO podés
  **probar** (`npm run dev`) ni correr los **scripts de base de datos**.
- Probar y las operaciones de base de datos se hacen en una compu con red (la de casa).

### Al correr LOCAL en CASA (después del `git pull`)

Cuando bajes lo último en casa y quieras correr el sistema local con `npm run dev`:

1. `git pull` — trae el código nuevo de GitHub.
2. **Si el pull tocó `package.json` o `package-lock.json`** → corré **`npm install`** una
   vez. (Se agregó o cambió alguna "pieza"/librería que el proyecto usa; viven en
   `node_modules`, que NO está en GitHub, así que cada compu baja las suyas. Sin
   `npm install`, el `npm run dev` falla con "cannot find module ...".)
3. `npm run dev`.

**Regla fácil (si no querés fijarte):** después de cada `git pull`, corré igual `npm install`
y luego `npm run dev`. Si no cambió nada, `npm install` no hace daño y termina rápido; si
cambió algo, te deja listo. (Esto es SOLO para correr local; en Vercel/Netlify ese
`npm install` lo hacen ellos en su nube, no te preocupa.)

---

## Pendientes (lo que falta)

- [ ] **FASE 4 — PRODUCCIÓN (integrar la app de producción al ERP). Fase 4-1 COMPLETA; RETOMAR EN FASE 4-2 (act. 2026-10-08).**
      - **👉 RETOMAR AQUÍ (próximo paso): FASE 4-2 — PRODUCCIÓN DIARIA.** Pantalla nueva en el ERP para
        anotar lo que se produce cada día: elegís fecha + centro (Taller), ponés cuántas unidades se
        hicieron de cada producto, y el ERP usa las recetas (ya cargadas) para **descontar la materia
        prima del inventario**, **ingresar el producto terminado** y hacer el **asiento contable**
        (Debe Inv PT / Haber Inv MP). Hoy esto se sigue registrando en la app VIEJA; el ERP todavía no
        tiene esa pantalla. **Antes de codear: proponer diseño + aprobación (convención #1).**
        ⚠️ **Lleva migración (tablas de producción diaria + RPC de explosión/posteo) y hay que PROBARLO
        contra la base** → eso es de CASA (con red). En el TRABAJO solo se puede diseñar/escribir código
        y hacer push; aplicar la migración y probar queda para casa.
      - **Decisión:** hacerlo **NATIVO** dentro del ERP (NO embeber), **integrado** con el
        inventario (costo por promedio ponderado) **+ costo manual de respaldo** para insumos que
        todavía no estén en inventario. **NO tocar la app viva** que usan los dependientes:
        GitHub Pages `chepitoadm-svg/produccion-diaria-chepito-`
        (link: https://chepitoadm-svg.github.io/produccion-diaria-chepito-/produccion-chepito.html),
        Supabase vieja **`fqwxhrxjphvqjtosxizb`** (aparte del ERP `iwtbfdrchzqcrewiaiua`).
      - **Plan por fases:** 1) Recetas/Costos (BOM) ✅ HECHA · 2) Producción diaria ⬅️ SIGUE · 3) explosión
        de materiales + costeo + posteo contable (Debe Inv PT / Haber Inv MP) · 4) horneadas y
        cálculo de receta · 5) cutover + crear usuarios a los dependientes + retirar la vieja.
      - **HECHO y subido (Fase 4-1):** migración `20261007100001_produccion_recetas.sql`
        (tablas `insumos_manuales`, `recetas`, `recetas_lineas`; `fn_costo_receta` recursivo con
        guardia circular; vista `v_recetas`; RLS por permiso `produccion.ver`/`produccion.gestionar`);
        `src/lib/data/recetas.ts`; pantalla `/produccion` (lista, blindada si falta la migración) +
        entrada de menú.
      - **PRIMER PASO EN CASA: HECHO (2026-10-08).** La migración `20261007100001` se aplicó a la
        base de producción (transacción + registrada en el historial). Verificado: tablas, funciones,
        vista `v_recetas` (corre contra el inventario real) y permisos creados. **OJO: NO se corrió
        `supabase db push`** por el desajuste de historial (ver KNOWN ISSUE abajo); se aplicó solo esa
        migración a mano, de forma segura.
      - **BUILD DE VERCEL ARREGLADO (2026-10-08, commit `60cabbb`).** Estaba en ROJO (y `/produccion`
        daba 404) porque faltaban en `src/types/database.ts` los tipos de las tablas nuevas
        (`insumos_manuales`/`recetas`/`recetas_lineas`) y la vista `v_recetas`. Se agregaron a mano;
        `npm run build` pasa y `/produccion` carga en Vercel. (Recordatorio: los tipos de Database se
        mantienen a mano; toda tabla/vista nueva hay que agregarla ahí o el build de Vercel se cae.)
      - **DATOS MIGRADOS de la app vieja (2026-10-08).** Copiados (solo lectura de la vieja, sin tocarla)
        desde `config.clave='costos_state'` de la Supabase vieja → ERP: **38 insumos (como INSUMOS
        MANUALES con su costo), 8 recetas intermedias, 67 productos, 178 líneas.** Costos **verificados
        al céntimo** contra cálculo independiente (75/75 coinciden). Decisión práctica: TODOS los insumos
        entraron como manuales (los costos calzan exacto con la app vieja); ligarlos al inventario
        (promedio ponderado) se hará después, uno por uno, con el editor. Nota: *Budin*, *gato blanco* y
        *tajada de queque vainilla* existen como receta intermedia Y como producto (nombres repetidos a
        propósito, costos distintos, está bien). El script de migración está blindado: aborta si las
        tablas ya tienen datos (no duplica).
      - **EDITOR — entrega 1/3 HECHA (2026-10-08, commit `6d6cf8f`): CRUD de insumos manuales.**
        `/produccion` permite crear/editar/activar-desactivar insumos manuales (botón "Nuevo insumo",
        acciones Editar/Desactivar), solo con permiso `produccion.gestionar`. Sin migración.
        Archivos: `src/lib/validation/produccion.ts`, `produccion/actions.ts`, `InsumoManualForm.tsx`,
        `produccion/insumos/{nuevo,[id]}/page.tsx`, `obtenerInsumoManual` en `data/recetas.ts`.
      - **EDITOR — entrega 2/3 HECHA (2026-10-08): editor de recetas y productos.**
        Migración `20261008100001_fn_guardar_receta` (RPC que guarda receta+líneas atómico, SECURITY
        INVOKER → RLS exige `produccion.gestionar`) **aplicada a producción** (método manual seguro,
        registrada en historial). Probada crear+editar contra la base (rollback). UI:
        `/produccion/recetas/{nuevo,[id]}` con `RecetaForm` (toggle producto/intermedia, líneas
        dinámicas con buscador que elige artículo de inventario / insumo manual / otra receta, **costo
        y margen en vivo**, precio para productos, rinde para intermedias). Botones "Nuevo producto" /
        "Nueva receta" y acciones Editar/Desactivar en la lista. Capa de datos: `obtenerReceta`,
        `listarFuentesReceta` (con costo por unidad base). Tipos: `fn_guardar_receta` agregada a
        `database.ts`. Verificado con `npm run build`.
      - **EDITOR — entrega 3/3 HECHA (2026-10-08): convertir insumo manual → artículo de inventario.**
        Botón "Convertir" en cada insumo manual activo → `/produccion/insumos/[id]/convertir` (muestra
        costo a mano vs costo del artículo, y cuántas recetas lo usan). RPC `fn_convertir_insumo`
        (migración `20261008100002`, aplicada): reapunta las líneas `insumo_manual`→`articulo` y
        desactiva el insumo manual. **Bug arreglado de paso** (migración `20261008100003`):
        `recetas_lineas` tenía el trigger `trg_set_actualizado` (de `fn_adjuntar_auditoria`) que
        reventaba cualquier UPDATE porque la tabla no tiene columna `actualizado_en`; se quitó.
      - **FASE 4-1 (Recetas/Costos BOM): COMPLETA.** Datos migrados + editor completo (insumos, recetas,
        productos, convertir). **Siguiente: Fase 4-2 (Producción diaria)** → explosión de materiales,
        consumo de MP / ingreso de PT con posteo contable (Debe Inv PT / Haber Inv MP).

- [ ] **⚠️ KNOWN ISSUE — HISTORIAL DE MIGRACIONES DESAJUSTADO (NO correr `supabase db push` a ciegas).**
      El `schema_migrations` del remoto solo tiene registradas las migraciones **hasta
      `20260724100035`**. El tramo **`...036`–`...116`** está APLICADO en la base (todas esas features
      viven y funcionan: ventas externas, prorrateo por cuenta, clasificación de costo, etc.) pero
      **NO quedó registrado** en el historial. Causa probable: se aplicaron en su momento sin pasar por
      el CLI. **Consecuencia:** un `supabase db push` normal intentaría RE-EJECUTAR `036`–`116` sobre
      objetos que ya existen → revienta. Por eso la migración de Fase 4 se aplicó a mano (transacción)
      y se registró solo ella. **Remedios (cuando se quiera limpiar, con calma):** marcar el tramo como
      aplicado con `supabase migration repair --status applied <versión> --db-url "$SUPABASE_DB_URL"`
      (036→116), verificando antes que cada objeto exista; luego `db push` ya funcionaría limpio.
      Mientras tanto, **cada migración nueva se aplica a mano** (patrón: script node con `pg`,
      `NODE_PATH` al `node_modules` del repo, en transacción, + insert en `schema_migrations`).

- [ ] **Duplicación de compras (Excel vs electrónicas) — DECISIÓN GRANDE (RETOMAR AQUÍ).**
      Al importar el Excel de QuPOS se crearon facturas que ya existían electrónicas
      (jaladas del correo) → duplicadas → compras/CxP inflados. La importación de Excel
      metió **377 facturas, ₡26,8M** (facturas con glosa `Import Excel%`). Ejemplo probado:
      huevo ₡22.220 del 29-sep estaba 2 veces (electrónica en Taller + Excel en CH2).
      **Falta que el usuario decida:**
      - Opción A (recomendada): quedarse con las ELECTRÓNICAS (legales de Hacienda) y quitar
        las duplicadas del Excel; las del Excel SIN gemela electrónica se quedan.
      - Opción B: quedarse con las del Excel (QuPOS) y quitar las electrónicas duplicadas.
      - Pregunta abierta: ¿el Excel se importó a propósito para cargar compras, o solo para
        comparar? (si fue solo comparar → quizás deshacer toda la importación).
      **Próximo paso cuando responda:** análisis completo del alcance (cuántas duplicadas
      exactas, por mes/centro) y de-duplicar con ensayo en rollback primero. Matchear por
      proveedor+total es ambiguo (montos se repiten); usar clave/consecutivo donde se pueda.
- [ ] **Deploys de Netlify PAUSADOS por créditos** (plan gratis, "operational credits": el
      sitio sigue en línea pero no publica cambios nuevos). Workaround ya montado: **Vercel**
      como destino de deploy (ver "Hecho reciente"). Falta decidir: ¿Vercel pasa a principal,
      se espera el próximo ciclo de Netlify, o se sube de plan? Lo que quedaba por publicar:
      NC del ingestor, ligar cédula a proveedor existente, export de flujo a Excel, cédula
      física en proveedores, artículo nuevo en factura manual.
- [ ] **Prorrateo agosto — General**: regenerar por cuenta en /admin/prorrateo.
- [ ] **Prorrateos septiembre** (Taller y General) cuando se cierre el mes.
- [ ] **¿Fusionar "Quesos el Trebol Avicola Chumo"** con Avícola Chumo? (preguntado, sin responder)
- [ ] **1 Nota de Débito** (₡5.009,60, Fábrica de Harinas) quedó como factura — revisar.
- [ ] **Regenerar el token (PAT) de GitHub** que se expuso (pendiente viejo).

## Hecho reciente (sep–oct 2026)

- **Fase 4-1 aplicada a producción (2026-10-08).** La migración `20261007100001_produccion_recetas`
  se aplicó a la base real (tablas `insumos_manuales`/`recetas`/`recetas_lineas`, funciones de costeo,
  vista `v_recetas`, permisos `produccion.*`). Como el `schema_migrations` está desajustado (ver KNOWN
  ISSUE en Pendientes), NO se usó `db push`: se aplicó solo esa migración dentro de una transacción
  (script node con `pg`) y se registró a mano en el historial. Verificado contra la base: objetos
  creados y `v_recetas` corre contra el inventario real. **Build de Vercel arreglado** (faltaban tipos
  en `database.ts`, daba 404) y **datos migrados** de la app vieja: 38 insumos (manuales), 8 recetas,
  67 productos, 178 líneas; costos verificados al céntimo (75/75). `/produccion` ya muestra las fichas.
  **Editor de Producción:** entrega 1 (CRUD insumos manuales) y entrega 2 (editor de recetas/productos
  con líneas, costo/margen en vivo, precio; RPC `fn_guardar_receta`) y entrega 3 (convertir insumo
  manual → artículo de inventario; RPC `fn_convertir_insumo` + fix del trigger de `recetas_lineas`)
  hechas y subidas. **Fase 4-1 completa**; sigue Fase 4-2 (producción diaria + posteo contable).
- **Saldo inicial Banco Popular Cuenta 1 (`11-10-15-01-01`) registrado** (2026-10): apertura al
  30/06/2026 = **₡3.316.689,04** (asiento tipo Apertura contra Depuración `31-11`). La conciliación
  de julio quedó cuadrada. Además, los asientos de **Apertura** ahora se **excluyen** de la lista de
  pendientes de conciliación (cuentan en el saldo de libros, no se casan contra el banco).
- **Fix conciliación bancaria (2026-10-02).** Los movimientos ya conciliados reaparecían
  como "pendientes" en la lista de libros cuando el total conciliado pasaba de 1.000
  (PostgREST corta en 1.000, la lista de "ya casados" quedaba incompleta). Arreglado
  paginando de 1000 en 1000 en `src/lib/data/conciliaciones.ts` (movimientos y conciliados).
  Puro código, sin migración. Verificado en Vercel. **OJO: Netlify sigue con el código viejo
  hasta que se reactiven sus deploys.**
- **Lectores de estado de cuenta: Popular CSV + fix fechas RIDIVI (2026-10-02).** Se agregó un
  lector del estado de cuenta del Banco Popular en **CSV** (`src/lib/csv/popularEstadoCuentaCsv.ts`,
  enganchado en `conciliaciones/actions.ts`; los forms de importar/agregar aceptan `.csv`). Y se
  arregló el lector de **RIDIVI**: sus fechas con guiones vienen en DD-MM-YYYY en unos export y
  MM-DD en otros, y reventaba con días > 12 (ej. `30-09-2026` → mes 30). Ahora desambigua por
  validez (número > 12 = día) + convención detectada del archivo. Ambos verificados en Vercel.
- **Vercel como destino de deploy (2026-10-02).** Repo conectado a Vercel (cuenta Hobby de
  `chepitoadm-svg`), env vars de Supabase puestas (las 3: URL, ANON, SERVICE_ROLE; NO va
  `SUPABASE_DB_URL`), primer deploy OK en `erp-chepito.vercel.app`. Cada push a `main`
  deploya en Vercel. **Se puede deployar desde la compu del TRABAJO** (git sí sale a
  internet aunque node siga bloqueado por el EDR). Netlify sigue conectado pero con deploys
  pausados por créditos. Vercel pega a la MISMA Supabase (no es copia aislada).
- Prorrateo por cuenta del centro General + arreglos (pool sin reversiones, cuentas
  siempre visibles, botón que rehace solo). Julio verificado.
- Saldo inicial BAC corregido a ₡313.488,03; pago TEF re-fechado a julio; conciliación OK.
- Lector de estado de cuenta RIDIVI + su saldo inicial; pestaña Resumen en conciliación.
- Export de Flujo de caja a Excel.
- Proveedores: acepta cédula física; ligar cédula a proveedor existente desde el ingestor;
  fusión de Avícola Chumo + Kattia María Vargas en uno solo.
- Notas de crédito del correo ahora se registran como NC (no como factura); se corrigieron
  6 NC de Fábrica de Harinas que estaban como facturas.
- Factura manual: crear artículo nuevo al vuelo.
- Análisis financiero jul/ago + puntos de equilibrio (Word + informe visual).
