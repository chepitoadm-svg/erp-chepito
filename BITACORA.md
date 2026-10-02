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

### Ojo con la compu del TRABAJO

- Ahí `node` NO tiene salida a internet (firewall). PowerShell y git SÍ.
- Entonces en el trabajo podés **escribir código y hacer `git push`**, pero NO podés
  **probar** (`npm run dev`) ni correr los **scripts de base de datos**.
- Probar y las operaciones de base de datos se hacen en una compu con red (la de casa).

---

## Pendientes (lo que falta)

- [ ] **Duplicación de compras (Excel vs electrónicas) — DECISIÓN GRANDE.** Al importar el
      Excel de QuPOS se crearon facturas que ya existían electrónicas (jaladas del correo)
      → duplicadas → compras/CxP inflados (la importación metió 377 facturas, ₡26,8M).
      Falta decidir la fuente de verdad (recomendado: electrónicas) y de-duplicar con cuidado.
- [ ] **Reactivar deploys de Netlify** (topados por minutos de build) para publicar lo de
      estos días: NC del ingestor, ligar cédula a proveedor existente, export de flujo a
      Excel, cédula física en proveedores, artículo nuevo en factura manual.
- [ ] **Prorrateo agosto — General**: regenerar por cuenta en /admin/prorrateo.
- [ ] **Prorrateos septiembre** (Taller y General) cuando se cierre el mes.
- [ ] **¿Fusionar "Quesos el Trebol Avicola Chumo"** con Avícola Chumo? (preguntado, sin responder)
- [ ] **1 Nota de Débito** (₡5.009,60, Fábrica de Harinas) quedó como factura — revisar.
- [ ] **Regenerar el token (PAT) de GitHub** que se expuso (pendiente viejo).

## Hecho reciente (sep–oct 2026)

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
