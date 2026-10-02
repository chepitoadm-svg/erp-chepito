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

---

## Pendientes (lo que falta)

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
