-- =============================================================================
-- Fase 3 — Migración 2: existencias, kardex y motor de promedio ponderado.
--
-- Regla dura: la integridad del inventario y su valuación se fuerzan en la
-- BASE, no en la pantalla. El kardex es inmutable; corregir = ajuste nuevo.
--
-- VALUACIÓN SIN DERIVA DE REDONDEO: el dato autoritativo es el DINERO
-- (valor_total), no el promedio. El promedio se deriva (valor_total /
-- existencia_total). Así el valor del kardex calza al céntimo con lo que se
-- postea a la cuenta contable de inventario. Cuando la existencia llega a 0,
-- valor_total queda en 0 exacto (la última salida absorbe el residuo).
-- =============================================================================

-- 1. Separar el MAESTRO (se audita, casi no cambia) de los SALDOS corridos
--    (cambian en cada movimiento; no se auditan porque el kardex ya es la
--    auditoría). En la migración 1 el promedio vivía en articulos; se mueve.
alter table public.articulos drop column if exists costo_promedio;
alter table public.articulos drop column if exists existencia_total;

create table public.articulos_saldos (
  articulo_id      uuid primary key references public.articulos(id),
  existencia_total numeric(18,4) not null default 0,   -- cantidad global
  valor_total      numeric(18,2) not null default 0,   -- DINERO (autoritativo)
  costo_promedio   numeric(18,4) not null default 0,   -- derivado, para mostrar
  actualizado_en   timestamptz not null default now()
);
comment on table public.articulos_saldos is
  'Saldos corridos globales por artículo. valor_total es el dato autoritativo; '
  'costo_promedio = valor_total/existencia_total (derivado). Lo mueve SOLO el '
  'motor de kardex. No se audita: el kardex es la auditoría.';

-- 2. Existencia por (artículo, bodega): SOLO cantidad. El valor es global.
create table public.existencias (
  articulo_id uuid not null references public.articulos(id),
  bodega_id   uuid not null references public.bodegas(id),
  cantidad    numeric(18,4) not null default 0,
  primary key (articulo_id, bodega_id)
);
comment on table public.existencias is
  'Cantidad por artículo y bodega. El valor = cantidad * costo_promedio global.';

-- 3. El KARDEX: movimientos inmutables.
create table public.movimientos_inventario (
  id               uuid primary key default gen_random_uuid(),
  articulo_id      uuid not null references public.articulos(id),
  bodega_id        uuid not null references public.bodegas(id),
  fecha            date not null default (now() at time zone 'America/Costa_Rica')::date,
  tipo             text not null check (tipo in (
                     'saldo_inicial','compra','ajuste_pos','transferencia_recepcion',
                     'ajuste_neg','transferencia_envio','devolucion_compra',
                     'venta','produccion_consumo','produccion_entrada','devolucion_venta')),
  -- Cantidad SIGNADA: + entra, - sale. El signo debe coincidir con el tipo.
  cantidad         numeric(18,4) not null check (cantidad <> 0),
  -- Los pone el motor; el caller solo provee costo_unitario en compra/saldo_inicial.
  costo_unitario   numeric(18,4) not null default 0 check (costo_unitario >= 0),
  costo_total      numeric(18,2) not null default 0,   -- signado como cantidad
  existencia_despues numeric(18,4) not null default 0, -- saldo de esa bodega tras el mov
  promedio_despues   numeric(18,4) not null default 0, -- promedio global tras el mov
  origen_tipo      text,                                 -- documento que lo generó
  origen_id        uuid,
  requiere_revision boolean not null default false,      -- futuro POS con negativo
  detalle          text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid()
);
comment on table public.movimientos_inventario is
  'Kardex. Inmutable: corregir = ajuste nuevo, nunca recálculo hacia atrás '
  '(el promedio es dependiente del camino).';

create index ix_mov_articulo on public.movimientos_inventario (articulo_id, fecha, creado_en);
create index ix_mov_bodega   on public.movimientos_inventario (bodega_id);
create index ix_mov_origen   on public.movimientos_inventario (origen_tipo, origen_id);

-- Idempotencia del posteo automático (una recepción/venta no entra dos veces).
create unique index ux_mov_origen
  on public.movimientos_inventario (origen_tipo, origen_id, articulo_id, bodega_id, tipo)
  where origen_id is not null;

-- =============================================================================
-- MOTOR DE PROMEDIO PONDERADO (BEFORE INSERT sobre el kardex)
-- =============================================================================
create or replace function public.fn_kardex_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_existe   numeric(18,4);
  v_valor    numeric(18,2);
  v_prom     numeric(18,4);
  v_bod      numeric(18,4);
  v_nuevo_ex numeric(18,4);
  v_valor_mov numeric(18,2);
  es_entrada boolean;
  trae_costo boolean;
  guarda_neg boolean;
begin
  es_entrada := new.tipo in
    ('saldo_inicial','compra','ajuste_pos','transferencia_recepcion',
     'produccion_entrada','devolucion_venta');
  trae_costo := new.tipo in ('saldo_inicial','compra');
  guarda_neg := new.tipo in ('ajuste_neg','transferencia_envio','devolucion_compra');

  -- --- El signo de la cantidad debe coincidir con el tipo -----------------
  if es_entrada and new.cantidad <= 0 then
    raise exception 'El tipo % es una entrada: la cantidad debe ser positiva.', new.tipo;
  end if;
  if not es_entrada and new.cantidad >= 0 then
    raise exception 'El tipo % es una salida: la cantidad debe ser negativa.', new.tipo;
  end if;

  -- --- Serializar por artículo: asegura la fila de saldos y la bloquea ----
  insert into public.articulos_saldos (articulo_id) values (new.articulo_id)
    on conflict (articulo_id) do nothing;
  select existencia_total, valor_total, costo_promedio
    into v_existe, v_valor, v_prom
    from public.articulos_saldos where articulo_id = new.articulo_id for update;

  -- --- Existencia actual de la bodega (para el candado de negativo) --------
  select cantidad into v_bod from public.existencias
   where articulo_id = new.articulo_id and bodega_id = new.bodega_id for update;
  v_bod := coalesce(v_bod, 0);

  if guarda_neg and (v_bod + new.cantidad) < 0 then
    raise exception
      'Existencia insuficiente: la bodega tiene % y la operación % saca %.',
      v_bod, new.tipo, abs(new.cantidad);
  end if;

  v_nuevo_ex := v_existe + new.cantidad;

  -- --- Cálculo del valor del movimiento y del nuevo saldo -----------------
  if trae_costo then
    -- Entrada con costo nuevo: recalcula el promedio.
    if new.costo_unitario is null then
      raise exception 'El tipo % exige costo_unitario.', new.tipo;
    end if;
    v_valor_mov := round(new.cantidad * new.costo_unitario, 2);
    v_valor     := v_valor + v_valor_mov;
  elsif es_entrada then
    -- Entrada al promedio actual (ajuste_pos, transferencia_recepcion): el
    -- promedio no cambia (entra a su propio promedio).
    v_valor_mov := round(new.cantidad * v_prom, 2);
    new.costo_unitario := v_prom;
    v_valor := v_valor + v_valor_mov;
  else
    -- Salida al promedio actual.
    if v_nuevo_ex = 0 then
      -- La última salida se lleva TODO el valor restante -> valor_total = 0
      -- exacto, sin deriva de redondeo.
      v_valor_mov := -v_valor;
    else
      v_valor_mov := -round(abs(new.cantidad) * v_prom, 2);
    end if;
    new.costo_unitario := v_prom;
    v_valor := v_valor + v_valor_mov;
  end if;

  -- Promedio derivado del dinero autoritativo.
  v_prom := case when v_nuevo_ex > 0 then round(v_valor / v_nuevo_ex, 4) else 0 end;

  -- --- Rellenar los campos foto del movimiento ----------------------------
  new.costo_total        := v_valor_mov;
  new.existencia_despues := v_bod + new.cantidad;
  new.promedio_despues   := v_prom;

  -- --- Aplicar a los saldos -----------------------------------------------
  update public.articulos_saldos
     set existencia_total = v_nuevo_ex,
         valor_total      = v_valor,
         costo_promedio   = v_prom,
         actualizado_en   = now()
   where articulo_id = new.articulo_id;

  insert into public.existencias (articulo_id, bodega_id, cantidad)
  values (new.articulo_id, new.bodega_id, new.cantidad)
  on conflict (articulo_id, bodega_id)
    do update set cantidad = public.existencias.cantidad + excluded.cantidad;

  return new;
end;
$$;

create trigger trg_kardex_movimiento
  before insert on public.movimientos_inventario
  for each row execute function public.fn_kardex_movimiento();

-- El kardex es inmutable: nada de UPDATE ni DELETE (regla anular-nunca-borrar).
create trigger trg_mov_inv_no_update
  before update on public.movimientos_inventario
  for each row execute function public.fn_bloquear_delete();
create trigger trg_mov_inv_no_delete
  before delete on public.movimientos_inventario
  for each row execute function public.fn_bloquear_delete();

-- =============================================================================
-- CARGA INICIAL: conciliación contra la apertura contable
-- =============================================================================
-- El movimiento saldo_inicial ingresa cantidad+costo SIN postear asiento (el
-- valor ya está en el asiento de apertura). Esta función compara el total del
-- kardex inicial contra el saldo de 11-60-01 en la apertura, para detectar
-- diferencias sin nunca duplicar el asiento.
create or replace function public.fn_conciliar_inventario_inicial()
returns table (
  valor_kardex_inicial   numeric(18,2),
  valor_apertura_contable numeric(18,2),
  diferencia             numeric(18,2)
)
language sql
stable
as $$
  with kardex as (
    select coalesce(sum(costo_total), 0)::numeric(18,2) v
      from public.movimientos_inventario where tipo = 'saldo_inicial'
  ),
  apertura as (
    select coalesce(sum(l.debito - l.credito), 0)::numeric(18,2) v
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
      join public.cuentas c on c.id = l.cuenta_id
     where a.tipo = 'apertura' and a.estado in ('confirmado','anulado')
       and c.codigo like '11-60-%' and c.acepta_movimiento
  )
  select k.v, ap.v, (k.v - ap.v)::numeric(18,2) from kardex k, apertura ap;
$$;

comment on function public.fn_conciliar_inventario_inicial() is
  'Compara el valor del kardex inicial contra el inventario del asiento de '
  'apertura. diferencia = 0 significa que cuadran.';

-- =============================================================================
-- VISTAS de apoyo
-- =============================================================================
create or replace view public.v_existencias_valoradas as
select
  a.id            as articulo_id,
  a.codigo        as articulo_codigo,
  a.nombre        as articulo_nombre,
  b.id            as bodega_id,
  b.codigo        as bodega_codigo,
  b.nombre        as bodega_nombre,
  b.sucursal_id,
  e.cantidad,
  s.costo_promedio,
  round(e.cantidad * s.costo_promedio, 2) as valor
from public.existencias e
join public.articulos a        on a.id = e.articulo_id
join public.bodegas b          on b.id = e.bodega_id
left join public.articulos_saldos s on s.articulo_id = e.articulo_id
where e.cantidad <> 0;

comment on view public.v_existencias_valoradas is
  'Existencia por artículo y bodega, valorada al promedio global.';

do $$
begin
  raise notice 'Kardex y motor de promedio ponderado listos (valor autoritativo, sin deriva).';
end $$;
