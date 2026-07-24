-- =============================================================================
-- FIX: los reportes excluían los asientos ANULADOS, descuadrando los saldos.
--
-- Al anular por reversión quedan DOS asientos en el libro: el original (estado
-- 'anulado') y su reversión (estado 'confirmado', líneas invertidas). Los
-- reportes filtraban estado = 'confirmado', así que contaban la reversión pero
-- NO el original: el neto quedaba en el negativo del monto anulado, en vez de
-- cero.
--
-- Un asiento 'anulado' SÍ afectó los libros (fue posteado) y su reversión lo
-- contrapone; ambos deben contar para que netee a cero. El filtro correcto es
-- estado in ('confirmado','anulado'). 'borrador' y 'descartado' nunca afectan
-- saldos y siguen excluidos.
-- =============================================================================

-- === LIBRO MAYOR (vista) ====================================================
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
where a.estado in ('confirmado', 'anulado');

-- === BALANZA ================================================================
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
     where a.estado in ('confirmado', 'anulado')
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

-- === ESTADO DE RESULTADOS ===================================================
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
  where a.estado in ('confirmado', 'anulado')
    and a.fecha between p_desde and p_hasta
    and c.tipo in ('ingreso','gasto')
    and (p_incluir_prorrateo or a.tipo <> 'prorrateo')
  group by cc.codigo, cc.nombre, cc.tipo, c.tipo, s.nombre, c.codigo, c.nombre, c.naturaleza
  having sum(l.debito) - sum(l.credito) <> 0
  order by cc.codigo, c.codigo;
$$;

-- === MAYOR POR CUENTA =======================================================
create or replace function public.app_mayor_cuenta(
  p_cuenta_id uuid,
  p_desde     date default null,
  p_hasta     date default null
)
returns table (
  fecha           date,
  asiento_id      uuid,
  asiento_tipo    text,
  asiento_numero  int,
  glosa           text,
  centro_codigo   text,
  debito          numeric(18,2),
  credito         numeric(18,2),
  saldo           numeric(18,2)
)
language sql
stable
security invoker
as $$
  with movimientos as (
    select a.fecha, a.id as asiento_id, a.tipo as asiento_tipo, a.numero as asiento_numero,
           a.glosa, cc.codigo as centro_codigo,
           l.debito, l.credito, a.creado_en
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
      left join public.centros_costo cc on cc.id = l.centro_costo_id
     where l.cuenta_id = p_cuenta_id
       and a.estado in ('confirmado', 'anulado')
       and (p_desde is null or a.fecha >= p_desde)
       and (p_hasta is null or a.fecha <= p_hasta)
  ),
  nat as (select naturaleza from public.cuentas where id = p_cuenta_id)
  select m.fecha, m.asiento_id, m.asiento_tipo, m.asiento_numero, m.glosa, m.centro_codigo,
         m.debito, m.credito,
         sum(case when (select naturaleza from nat) = 'deudora'
                  then m.debito - m.credito
                  else m.credito - m.debito end)
           over (order by m.fecha, m.creado_en
                 rows between unbounded preceding and current row)::numeric(18,2) as saldo
    from movimientos m
   order by m.fecha, m.creado_en;
$$;

-- === POOL DEL PRORRATEO (estado) ============================================
create or replace function public.app_estado_prorrateo(p_periodo uuid)
returns table (
  centro_id          uuid,
  codigo             text,
  nombre             text,
  requiere_prorrateo boolean,
  pool               numeric(18,2),
  suma_bases         numeric(9,4),
  bases              jsonb
)
language sql
stable
security invoker
as $$
  select
    c.id, c.codigo, c.nombre, c.requiere_prorrateo,
    coalesce((
      select sum(l.debito) - sum(l.credito)
        from public.asientos_lineas l
        join public.asientos a on a.id = l.asiento_id
       where a.estado in ('confirmado', 'anulado')
         and a.periodo_id = p_periodo
         and a.tipo <> 'prorrateo'
         and l.centro_costo_id = c.id
    ), 0)::numeric(18,2),
    coalesce((
      select sum(b.porcentaje) from public.prorrateo_bases b
       where b.periodo_id = p_periodo and b.centro_origen_id = c.id
    ), 0)::numeric(9,4),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'centro_destino_id', b.centro_destino_id,
        'destino_codigo', d.codigo,
        'porcentaje', b.porcentaje
      ) order by d.codigo)
        from public.prorrateo_bases b
        join public.centros_costo d on d.id = b.centro_destino_id
       where b.periodo_id = p_periodo and b.centro_origen_id = c.id
    ), '[]'::jsonb)
  from public.centros_costo c
  where c.activo and c.tipo = 'intermedio'
  order by c.codigo;
$$;

-- === POOL DEL GENERADOR DE PRORRATEO ========================================
-- Solo cambia el filtro de estado en el cursor por cuenta; el resto es idéntico.
create or replace function public.fn_generar_prorrateo(
  p_periodo_id uuid,
  p_centro_origen_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_tipo_o    text;
  v_cod_o     text;
  v_fecha     date;
  v_asiento   uuid;
  v_linea     int := 0;
  v_n_destinos int;
  r_cuenta    record;
  r_dest      record;
  v_pool      numeric(18,2);
  v_acum      numeric(18,2);
  v_monto     numeric(18,2);
  v_i         int;
begin
  select tipo, codigo into v_tipo_o, v_cod_o
    from public.centros_costo where id = p_centro_origen_id;
  if v_tipo_o is null then
    raise exception 'Centro de costo % inexistente.', p_centro_origen_id;
  end if;
  if v_tipo_o <> 'intermedio' then
    raise exception 'Solo se prorratea un centro INTERMEDIO (% es %).', v_cod_o, v_tipo_o;
  end if;

  perform public.fn_exigir_periodo_abierto(p_periodo_id);
  select fecha_fin into v_fecha from public.periodos_contables where id = p_periodo_id;

  select count(*) into v_n_destinos
    from public.prorrateo_bases
   where periodo_id = p_periodo_id and centro_origen_id = p_centro_origen_id;

  if v_n_destinos = 0 then
    raise exception 'El centro % no tiene bases de prorrateo cargadas para ese periodo.', v_cod_o;
  end if;

  insert into public.asientos (tipo, fecha, glosa)
  values ('prorrateo', v_fecha, 'Prorrateo de ' || v_cod_o || ' del periodo')
  returning id into v_asiento;

  for r_cuenta in
    select l.cuenta_id,
           sum(l.debito) - sum(l.credito) as saldo
      from public.asientos_lineas l
      join public.asientos a on a.id = l.asiento_id
     where a.estado in ('confirmado', 'anulado')
       and a.periodo_id = p_periodo_id
       and l.centro_costo_id = p_centro_origen_id
     group by l.cuenta_id
    having sum(l.debito) - sum(l.credito) <> 0
    order by l.cuenta_id
  loop
    v_pool := r_cuenta.saldo;
    v_acum := 0;
    v_i    := 0;

    for r_dest in
      select b.centro_destino_id, b.porcentaje
        from public.prorrateo_bases b
       where b.periodo_id = p_periodo_id
         and b.centro_origen_id = p_centro_origen_id
       order by b.orden, b.centro_destino_id
    loop
      v_i := v_i + 1;
      if v_i < v_n_destinos then
        v_monto := round(v_pool * r_dest.porcentaje / 100, 2);
        v_acum  := v_acum + v_monto;
      else
        v_monto := v_pool - v_acum;
      end if;

      if v_monto <> 0 then
        v_linea := v_linea + 1;
        insert into public.asientos_lineas
          (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
        values (
          v_asiento, v_linea, r_cuenta.cuenta_id, r_dest.centro_destino_id,
          case when v_monto > 0 then  v_monto else 0 end,
          case when v_monto < 0 then -v_monto else 0 end,
          abs(v_monto),
          'Prorrateo desde ' || v_cod_o
        );
      end if;
    end loop;

    v_linea := v_linea + 1;
    insert into public.asientos_lineas
      (asiento_id, linea, cuenta_id, centro_costo_id, debito, credito, monto_original, detalle)
    values (
      v_asiento, v_linea, r_cuenta.cuenta_id, p_centro_origen_id,
      case when v_pool < 0 then -v_pool else 0 end,
      case when v_pool > 0 then  v_pool else 0 end,
      abs(v_pool),
      'Vaciado de ' || v_cod_o
    );
  end loop;

  if v_linea = 0 then
    raise exception 'El centro % no tiene saldo que prorratear en ese periodo.', v_cod_o;
  end if;

  return v_asiento;
end;
$$;

do $$
begin
  raise notice 'Reportes corregidos: los asientos anulados ya cuentan (netean a cero con su reversión).';
end $$;
