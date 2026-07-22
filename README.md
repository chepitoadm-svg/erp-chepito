# ERP Chepito — Fundación (Fase 1)

ERP a la medida para **Panaderías Chepito** (COMERCIALIZADORA Y PANADERIA
CHEPIT S.A.), Costa Rica. Stack: **Next.js (App Router) + Supabase (Postgres,
Auth, RLS)**. La fuente de verdad del proyecto es `CLAUDE.md`; los requisitos
por módulo están en `requisitos-erp-chepito.md`.

Esta fase entrega el **núcleo**: empresa, sucursales/centros de costo, bodegas,
catálogo de cuentas, periodos contables, usuarios/roles/permisos, auditoría,
Auth + RLS, y la **gestión de usuarios de punta a punta** como patrón de
referencia.

---

## Requisitos

- **Node.js 20+** (probado con v24).
- Un **proyecto de Supabase nuevo y exclusivo** para este ERP (nube).
- No requiere Docker.

> Nota: en la compu del trabajo `node.exe` no tiene salida de red (firewall
> corporativo), así que la instalación y las pruebas se hacen en otra máquina
> donde Node sí pueda salir a internet.

---

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Copiá `.env.example` a `.env.local` y completá con las credenciales de tu
proyecto (Dashboard de Supabase → Project Settings → API / Database):

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)
- `SUPABASE_DB_URL` (para la CLI de migraciones)

### 3. Aplicar el esquema (migraciones versionadas)

Enlazá la CLI a tu proyecto y empujá las migraciones. **Nunca** se editan
tablas a mano en el dashboard.

```bash
npx supabase login
npm run db:link -- --project-ref <TU_PROJECT_REF>
npm run db:push
```

Luego cargá los datos base (empresa, sucursales, roles, permisos, catálogo
mínimo). El seed es idempotente; corré su contenido contra la base:

```bash
# Opción A: con psql y la cadena de conexión de tu proyecto
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

O, si preferís, pegá el contenido de `supabase/seed.sql` en el **SQL Editor**
del Dashboard y ejecutalo (es idempotente, se puede correr varias veces).

### 4. Crear el primer administrador

1. Dashboard → Authentication → Users → **Add user** (email + contraseña).
   El trigger le crea automáticamente su perfil.
2. Editá `supabase/scripts/bootstrap_admin.sql` con ese email y corrélo una vez
   (SQL Editor o `psql`). Queda como **administrador** con todas las sucursales.

### 5. Correr la app

```bash
npm run dev
```

Abrí <http://localhost:3000>, ingresá con el admin y entrá a **Usuarios**.

---

## Criterio de verificación (Fase 1)

Debo poder:

1. Iniciar sesión con el administrador.
2. Crear un usuario, asignarle rol **cajero** y la sucursal **Chepito 1**.
3. Desactivarlo (queda inactivo, **no se borra**).
4. Al entrar como ese cajero, ver **solo** datos de Chepito 1 y **no** poder
   abrir la gestión de usuarios.
5. Ver cada acción registrada en la tabla `auditoria`.

---

## Estructura

```
supabase/
  migrations/   # esquema versionado (0001..0006)
  seed.sql      # datos base idempotentes
  scripts/      # bootstrap del primer admin
src/
  app/          # rutas (login, shell, usuarios)
  lib/
    supabase/   # clientes: browser, server (RLS), admin (service_role)
    auth/       # helpers de permisos (servidor)
    data/       # capa de datos (lecturas)
    validation/ # esquemas Zod
  components/   # UI (formulario de usuario)
  types/        # tipos del esquema (regenerables con npm run db:types)
middleware.ts   # refresco de sesión + protección de rutas
```

## Reglas duras respetadas

- **Auditoría** en todas las tablas (trigger genérico).
- **Anular, nunca borrar**: sin políticas de DELETE; baja = `estado`.
- **RLS desde el día uno** por rol y sucursal, con `(select auth.uid())` y
  funciones helper `STABLE`.
- **Migraciones SQL versionadas** (nada de cambios ad-hoc en el dashboard).
- Base lista para **doble partida**, **bloqueo de periodos** y **saldos
  iniciales** (motor contable en la Fase 2).
