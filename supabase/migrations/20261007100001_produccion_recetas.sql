-- =============================================================================
-- Fase 4 — Migración 1: Recetas / Costos (BOM).
--
-- Cadena de 3 niveles, igual que la app de producción single-file:
--   insumos  →  recetas (intermedias, anidables)  →  productos (finales)
-- Integrada al ERP: un insumo puede ser un ARTÍCULO del inventario (costo real
-- por promedio ponderado) o un INSUMO MANUAL (costo a mano, para lo que todavía
-- no está en inventario). Las recetas pueden anidarse (una usa otra).
--
-- Esta fase NO postea contabilidad ni mueve inventario: solo recetas + costeo.
-- El consumo de MP / ingreso de PT con su asiento es la Fase 4-2 (producción).
--
-- Reglas duras: RLS por permiso (catálogo global, no por sucursal), auditoría,
-- estado para retirar (no borrado físico de maestros, igual que articulos).
-- =============================================================================

-- === PERMISOS ===============================================================
insert into public.permisos (modulo, accion, codigo, descripcion) values
  ('produccion', 'ver',       'produccion.ver',       'Ver recetas y costos de producción'),
  ('produccion', 'gestionar', 'produccion.gestionar', 'Crear/editar recetas, productos e insumos')
on conflict (codigo) do nothing;

-- Administrador: todos los permisos nuevos.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id from public.roles r
  join public.permisos p on p.codigo in ('produccion.ver','produccion.gestionar')
 where r.codigo = 'administrador'
on conflict do nothing;

-- === UNIDADES DE RECETA (base: g / ml / unidad) =============================
-- Las recetas piensan en g/kg/ml/L/unidad/porcion (como la app). Se convierte
-- todo a la unidad base de su familia para costear: peso→g, volumen→ml, conteo→unidad.
create or replace function public.fn_rec_base(p_cant numeric, p_unidad text)
returns numeric language sql immutable as $$
  select coalesce(p_cant, 0) * case p_unidad
    when 'g'       then 1
    when 'kg'      then 1000
    when 'ml'      then 1
    when 'L'       then 1000
    when 'unidad'  then 1
    when 'porcion' then 1
    else 1 end;
$$;

-- Factor de la unidad de STOCK de un artículo a su unidad base (o NULL si la
-- unidad del artículo no es de peso/volumen/conteo simple — ej. SACO, CJ, BOT:
-- esos van como insumo manual o se re-expresa el artículo en KG/UN).
create or replace function public.fn_rec_factor_articulo(p_unidad_codigo text)
returns numeric language sql immutable as $$
  select case upper(coalesce(p_unidad_codigo,''))
    when 'G'      then 1
    when 'KG'     then 1000
    when 'ML'     then 1
    when 'L'      then 1000
    when 'UN'     then 1
    when 'UNIDAD' then 1
    else null end;
$$;

-- === INSUMOS MANUALES (MP que todavía no está en el inventario) =============
create table public.insumos_manuales (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  costo_compra    numeric(18,4) not null check (costo_compra >= 0),   -- ₡ del paquete comprado
  cantidad_compra numeric(18,6) not null check (cantidad_compra > 0), -- cuánto trae ese paquete
  unidad          text not null check (unidad in ('g','kg','ml','L','unidad','porcion')),
  proveedor       text,
  estado          text not null default 'activo' check (estado in ('activo','inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid
);
comment on table public.insumos_manuales is
  'Insumos con costo a mano, para MP que todavía no está en el inventario. Los '
  'que sí están en inventario se referencian como artículo (costo promedio real).';
select public.fn_adjuntar_auditoria('public.insumos_manuales');

-- === RECETAS (intermedias) y PRODUCTOS (finales) ============================
-- Mismo molde: una receta tiene componentes y se costea. es_producto distingue
-- el producto final (con precio) de la receta intermedia (con rendimiento).
create table public.recetas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  es_producto     boolean not null default false,       -- true=producto final; false=receta intermedia
  clasificacion   text,                                   -- texto libre (ej. "Masa"), como el 'tipo' de la app
  rinde_cantidad  numeric(18,6),                          -- rendimiento (intermedias)
  rinde_unidad    text check (rinde_unidad in ('g','kg','ml','L','unidad','porcion')),
  precio_venta    numeric(18,2) check (precio_venta is null or precio_venta >= 0),  -- productos finales
  articulo_id     uuid references public.articulos(id),   -- opcional: liga el producto final a un artículo (Fase 4-2)
  estado          text not null default 'activo' check (estado in ('activo','inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz,
  actualizado_por uuid,
  -- Una intermedia necesita rendimiento para poder costear "por unidad base".
  check (es_producto or (rinde_cantidad is not null and rinde_cantidad > 0 and rinde_unidad is not null))
);
comment on table public.recetas is
  'Recetas intermedias (es_producto=false, con rendimiento) y productos finales '
  '(es_producto=true, con precio). Los componentes viven en recetas_lineas.';
create index ix_recetas_producto on public.recetas (es_producto) where estado = 'activo';
select public.fn_adjuntar_auditoria('public.recetas');

-- === LÍNEAS / COMPONENTES ===================================================
-- Cada línea referencia UNO de: artículo del inventario | insumo manual | otra receta.
create table public.recetas_lineas (
  id               uuid primary key default gen_random_uuid(),
  receta_id        uuid not null references public.recetas(id) on delete cascade,
  linea            int not null,
  tipo_ref         text not null check (tipo_ref in ('articulo','insumo_manual','receta')),
  articulo_id      uuid references public.articulos(id),
  insumo_manual_id uuid references public.insumos_manuales(id),
  receta_ref_id    uuid references public.recetas(id),
  cantidad         numeric(18,6) not null check (cantidad > 0),
  unidad           text not null check (unidad in ('g','kg','ml','L','unidad','porcion')),
  unique (receta_id, linea),
  -- exactamente la referencia que corresponde al tipo_ref, y las otras en null:
  check (
    (tipo_ref = 'articulo'      and articulo_id      is not null and insumo_manual_id is null and receta_ref_id is null) or
    (tipo_ref = 'insumo_manual' and insumo_manual_id is not null and articulo_id      is null and receta_ref_id is null) or
    (tipo_ref = 'receta'        and receta_ref_id    is not null and articulo_id      is null and insumo_manual_id is null)
  ),
  -- una receta no se puede usar a sí misma en una línea (el ciclo lo corta la función de costeo)
  check (receta_ref_id is null or receta_ref_id <> receta_id)
);
create index ix_reclin_receta  on public.recetas_lineas (receta_id);
create index ix_reclin_art     on public.recetas_lineas (articulo_id);
create index ix_reclin_recref  on public.recetas_lineas (receta_ref_id);
select public.fn_adjuntar_auditoria('public.recetas_lineas');

-- === COSTEO (recursivo, con guardia de referencia circular) =================
-- Replica la lógica de la app:
--   costo por unidad base del referenciado × cantidad (en base) de la línea, sumado.
-- Artículo: costo_promedio real (articulos_saldos) / factor de su unidad de stock.
-- Insumo manual: costo_compra / (cantidad_compra en base).
-- Receta anidada: costo de la sub-receta / (su rendimiento en base).
-- SECURITY DEFINER para poder leer articulos_saldos (costos) al costear, aunque
-- el usuario de producción no tenga inventario.ver.
create or replace function public.fn_costo_receta(p_receta uuid, p_visiting uuid[] default '{}')
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_total numeric(18,6) := 0;
  v_cpb   numeric;   -- costo por unidad base del referenciado
begin
  if p_receta = any(p_visiting) then
    raise exception 'Receta circular: % ya está en la cadena.', p_receta;
  end if;

  for r in select * from public.recetas_lineas where receta_id = p_receta order by linea loop
    v_cpb := null;

    if r.tipo_ref = 'articulo' then
      select case when public.fn_rec_factor_articulo(u.codigo) is null then null
                  else coalesce(s.costo_promedio, 0) / public.fn_rec_factor_articulo(u.codigo) end
        into v_cpb
        from public.articulos a
        join public.unidades u on u.id = a.unidad_stock_id
        left join public.articulos_saldos s on s.articulo_id = a.id
       where a.id = r.articulo_id;

    elsif r.tipo_ref = 'insumo_manual' then
      select case when public.fn_rec_base(im.cantidad_compra, im.unidad) > 0
                  then im.costo_compra / public.fn_rec_base(im.cantidad_compra, im.unidad)
                  else null end
        into v_cpb
        from public.insumos_manuales im where im.id = r.insumo_manual_id;

    elsif r.tipo_ref = 'receta' then
      select case when public.fn_rec_base(sr.rinde_cantidad, sr.rinde_unidad) > 0
                  then public.fn_costo_receta(sr.id, p_visiting || p_receta)
                       / public.fn_rec_base(sr.rinde_cantidad, sr.rinde_unidad)
                  else null end
        into v_cpb
        from public.recetas sr where sr.id = r.receta_ref_id;
    end if;

    if v_cpb is not null then
      v_total := v_total + public.fn_rec_base(r.cantidad, r.unidad) * v_cpb;
    end if;
  end loop;

  return round(v_total, 2);
end $$;
grant execute on function public.fn_costo_receta(uuid, uuid[]) to authenticated;

-- === VISTA: recetas con su costo (y margen para productos) ==================
create or replace view public.v_recetas with (security_invoker = true) as
select r.id, r.nombre, r.es_producto, r.clasificacion,
       r.rinde_cantidad, r.rinde_unidad, r.precio_venta, r.articulo_id, r.estado, r.creado_en,
       c.costo,
       case when r.es_producto and coalesce(r.precio_venta,0) > 0
            then round(r.precio_venta - c.costo, 2) end as margen,
       case when r.es_producto and coalesce(r.precio_venta,0) > 0
            then round((r.precio_venta - c.costo) / r.precio_venta * 100, 1) end as margen_pct
from public.recetas r
cross join lateral (select public.fn_costo_receta(r.id) as costo) c;

-- =============================================================================
-- RLS — catálogo global: lectura abierta a autenticados; escritura por permiso.
-- =============================================================================
alter table public.insumos_manuales enable row level security;
alter table public.recetas          enable row level security;
alter table public.recetas_lineas   enable row level security;

create policy insm_sel on public.insumos_manuales for select to authenticated using (true);
create policy insm_wr  on public.insumos_manuales for all to authenticated
  using (public.tengo_permiso('produccion.gestionar')) with check (public.tengo_permiso('produccion.gestionar'));

create policy rec_sel on public.recetas for select to authenticated using (true);
create policy rec_wr  on public.recetas for all to authenticated
  using (public.tengo_permiso('produccion.gestionar')) with check (public.tengo_permiso('produccion.gestionar'));

create policy reclin_sel on public.recetas_lineas for select to authenticated using (true);
create policy reclin_wr  on public.recetas_lineas for all to authenticated
  using (public.tengo_permiso('produccion.gestionar')) with check (public.tengo_permiso('produccion.gestionar'));

do $$
begin
  raise notice 'Fase 4-1 lista: insumos_manuales, recetas, recetas_lineas + costeo recursivo + RLS.';
end $$;
