-- =============================================================================
-- Libro Mayor, balanza de comprobación y estados financieros.
--
-- TODAS filtran estado = 'confirmado'. Un borrador no afecta saldos, y un
-- anulado queda neutralizado por su reversión (ambos permanecen en el libro).
--
-- El signo del saldo sale de cuentas.naturaleza, que es un campo explícito del
-- catálogo. No se deduce del tipo dentro de cada vista: la lógica de signos
-- regada por las vistas es donde nacen los reportes que no cuadran.
-- =============================================================================

-- === LIBRO MAYOR ============================================================
create or replace view public.v_mayor as
select
  a.id            as asiento_id,
  a.tipo          as asiento_tipo,
  a.numero        as asiento_numero,
  a.fecha,
  a.glosa,
  a.periodo_id,
  p.anio,
  p.mes,
  l.linea,
  c.codigo        as cuenta_codigo,
  c.nombre        as cuenta_nombre,
  c.tipo          as cuenta_tipo,
  c.naturaleza,
  cc.codigo       as centro_codigo,
  cc.nombre       as centro_nombre,
  cc.tipo         as centro_tipo,
  l.debito,
  l.credito,
  l.moneda,
  l.tipo_cambio,
  l.monto_original,
  l.detalle
from public.asientos_lineas l
join public.asientos a            on a.id = l.asiento_id
join public.periodos_contables p  on p.id = a.periodo_id
join public.cuentas c             on c.id = l.cuenta_id
left join public.centros_costo cc on cc.id = l.centro_costo_id
where a.estado = 'confirmado';

comment on view public.v_mayor is 'Libro Mayor: detalle de líneas de asientos confirmados.';

-- === BALANZA DE COMPROBACIÓN (con acumulado hacia arriba) ===================
-- Cada cuenta acumula sus propios movimientos MÁS los de todos sus
-- descendientes, para que 43-10-07 ruede hasta 43-10 y hasta 43.
create or replace function public.fn_balanza(
  p_hasta               date,
  p_incluir_prorrateo   boolean default true
)
returns table (
  codigo            text,
  nombre            text,
  nivel             int,
  tipo              text,
  naturaleza        text,
  acepta_movimiento boolean,
  debitos           numeric(18,2),
  creditos          numeric(18,2),
  saldo             numeric(18,2)
)
language sql
stable
as $$
  with recursive mov as (
    select l.cuenta_id, sum(l.debito) as d, sum(l.credito) as c
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
     where a.estado = 'confirmado'
       and a.fecha <= p_hasta
       and (p_incluir_prorrateo or a.tipo <> 'prorrateo')
     group by l.cuenta_id
  ),
  arbol as (
    select id as raiz, id as nodo from public.cuentas
    union all
    select t.raiz, c.id
      from arbol t
      join public.cuentas c on c.cuenta_padre_id = t.nodo
  )
  select
    cu.codigo, cu.nombre, cu.nivel, cu.tipo, cu.naturaleza, cu.acepta_movimiento,
    coalesce(sum(m.d), 0)::numeric(18,2),
    coalesce(sum(m.c), 0)::numeric(18,2),
    (case when cu.naturaleza = 'deudora'
          then coalesce(sum(m.d), 0) - coalesce(sum(m.c), 0)
          else coalesce(sum(m.c), 0) - coalesce(sum(m.d), 0)
     end)::numeric(18,2)
  from public.cuentas cu
  join arbol t         on t.raiz = cu.id
  left join mov m      on m.cuenta_id = t.nodo
  group by cu.id, cu.codigo, cu.nombre, cu.nivel, cu.tipo, cu.naturaleza, cu.acepta_movimiento
  order by cu.codigo;
$$;

comment on function public.fn_balanza(date, boolean) is
  'Balanza de comprobación acumulada hacia los niveles superiores del catálogo.';

-- === BALANCE DE SITUACIÓN ===================================================
-- Excluye las cuentas de ORDEN: son de memorando y si se cuelan inflan el
-- balance.
create or replace function public.fn_balance_situacion(p_fecha date)
returns table (
  seccion  text,
  subtipo  text,
  codigo   text,
  nombre   text,
  nivel    int,
  saldo    numeric(18,2)
)
language sql
stable
as $$
  select
    case b.tipo when 'activo'     then 'ACTIVO'
                when 'pasivo'     then 'PASIVO'
                else                   'PATRIMONIO' end,
    coalesce(s.nombre, '(sin subtipo)'),
    b.codigo, b.nombre, b.nivel, b.saldo
  from public.fn_balanza(p_fecha, true) b
  join public.cuentas cu            on cu.codigo = b.codigo
  left join public.cuentas_subtipos s on s.codigo = cu.subtipo_codigo
  where b.tipo in ('activo','pasivo','patrimonio')
    and b.saldo <> 0
  order by b.codigo;
$$;

comment on function public.fn_balance_situacion(date) is
  'Balance de Situación a una fecha. Excluye cuentas de orden.';

-- === ESTADO DE RESULTADOS POR CENTRO DE COSTO ===============================
-- Formato largo (una fila por centro y cuenta). El pivote a columnas por canal
-- lo hace la UI: los centros son extensibles y una vista con columnas fijas
-- obligaría a migrar cada vez que se agrega un canal.
--
-- p_incluir_prorrateo permite sacar el MISMO libro antes y después del
-- prorrateo: antes dice qué costó el Taller de verdad, después dice la
-- rentabilidad por canal. La diferencia entre ambos es exactamente el asiento
-- de prorrateo.
create or replace function public.fn_estado_resultados(
  p_desde             date,
  p_hasta             date,
  p_incluir_prorrateo boolean default true
)
returns table (
  centro_codigo  text,
  centro_nombre  text,
  centro_tipo    text,
  seccion        text,
  subtipo        text,
  cuenta_codigo  text,
  cuenta_nombre  text,
  monto          numeric(18,2)
)
language sql
stable
as $$
  select
    cc.codigo, cc.nombre, cc.tipo,
    case c.tipo when 'ingreso' then 'INGRESOS' else 'GASTOS' end,
    coalesce(s.nombre, '(sin subtipo)'),
    c.codigo, c.nombre,
    (case when c.naturaleza = 'deudora'
          then sum(l.debito) - sum(l.credito)
          else sum(l.credito) - sum(l.debito)
     end)::numeric(18,2)
  from public.asientos_lineas l
  join public.asientos a              on a.id = l.asiento_id
  join public.cuentas c               on c.id = l.cuenta_id
  join public.centros_costo cc        on cc.id = l.centro_costo_id
  left join public.cuentas_subtipos s on s.codigo = c.subtipo_codigo
  where a.estado = 'confirmado'
    and a.fecha between p_desde and p_hasta
    and c.tipo in ('ingreso','gasto')     -- las de orden quedan fuera
    and (p_incluir_prorrateo or a.tipo <> 'prorrateo')
  group by cc.codigo, cc.nombre, cc.tipo, c.tipo, s.nombre, c.codigo, c.nombre, c.naturaleza
  having sum(l.debito) - sum(l.credito) <> 0
  order by cc.codigo, c.codigo;
$$;

comment on function public.fn_estado_resultados(date, date, boolean) is
  'Estado de Resultados por centro de costo, en formato largo. '
  'p_incluir_prorrateo = false devuelve el resultado ANTES de prorratear.';

-- === LIBRO DE INVENTARIOS Y BALANCES — mitad "Balances" =====================
-- Los libros obligatorios en CR son tres: Diario, Mayor e Inventarios y
-- Balances. La mitad "Balances" sale de acá. La mitad "Inventarios" (detalle
-- valuado por ítem) se difiere a Fase 3, cuando exista el kardex con promedio
-- ponderado; hasta entonces el respaldo es el conteo físico documentado.
create or replace function public.fn_libro_balances(p_fecha date)
returns table (
  seccion text,
  subtipo text,
  codigo  text,
  nombre  text,
  nivel   int,
  saldo   numeric(18,2)
)
language sql
stable
as $$
  select * from public.fn_balance_situacion(p_fecha)
  union all
  select 'RESULTADO DEL PERIODO', r.seccion, r.cuenta_codigo, r.cuenta_nombre, 0,
         sum(r.monto)::numeric(18,2)
    from public.fn_estado_resultados(
           date_trunc('year', p_fecha)::date, p_fecha, true) r
   group by r.seccion, r.cuenta_codigo, r.cuenta_nombre
   order by 1, 3;
$$;

comment on function public.fn_libro_balances(date) is
  'Mitad "Balances" del libro de Inventarios y Balances, a una fecha de corte. '
  'La mitad "Inventarios" llega en Fase 3 con el kardex.';

do $$
begin
  raise notice 'Mayor, balanza y estados financieros listos.';
end $$;
