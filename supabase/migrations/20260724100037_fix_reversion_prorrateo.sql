-- =============================================================================
-- FIX: el modo "sin prorrateo" del Estado de Resultados (y el drill-down al
-- Mayor) inflaba el costo del Taller.
--
-- Al regenerar el prorrateo, el sistema anula el prorrateo anterior por
-- reversión. En "sin prorrateo" se excluían los asientos tipo='prorrateo' pero
-- NO sus reversiones (tipo='reversion'), que quedaban sumando sin su contraparte
-- (el prorrateo excluido). Cada regeneración inflaba el número. Con dos
-- regeneraciones, Compras gravadas del Taller salía 3.457.123,26 en vez de
-- 1.152.374,42 (el costo real).
--
-- Regla correcta: en "sin prorrateo" se ignora TODO el mecanismo de prorrateo:
-- los asientos tipo='prorrateo' Y las reversiones cuyo asiento original era un
-- prorrateo. Las reversiones de egresos/gastos normales NO se tocan (netean con
-- su original anulado, como debe ser).
-- =============================================================================

create or replace function public.fn_estado_resultados(p_desde date, p_hasta date, p_incluir_prorrateo boolean default true)
returns table(centro_codigo text, centro_nombre text, centro_tipo text, seccion text, subtipo text, cuenta_codigo text, cuenta_nombre text, monto numeric)
language sql stable as $function$
  select
    cc.codigo, cc.nombre, cc.tipo,
    case left(c.codigo, 2)
      when '41' then 'ingresos_operacion'
      when '51' then 'costo_ventas'
      when '61' then 'gastos_operacion'
      when '62' then 'gastos_operacion'
      when '42' then 'otros_ingresos'
      when '43' then 'otros_ingresos'
      when '52' then 'otros_ingresos'
      when '63' then 'otros_gastos'
      when '64' then 'otros_gastos'
      else (case c.tipo when 'ingreso' then 'otros_ingresos' else 'otros_gastos' end)
    end,
    coalesce(s.nombre, '(sin subtipo)'),
    c.codigo, c.nombre,
    (case c.tipo when 'ingreso'
          then sum(l.credito) - sum(l.debito)
          else sum(l.debito)  - sum(l.credito)
     end)::numeric(18,2)
  from public.asientos_lineas l
  join public.asientos a              on a.id = l.asiento_id
  join public.cuentas c               on c.id = l.cuenta_id
  join public.centros_costo cc        on cc.id = l.centro_costo_id
  left join public.cuentas_subtipos s on s.codigo = c.subtipo_codigo
  where a.estado in ('confirmado', 'anulado')
    and a.fecha between p_desde and p_hasta
    and c.tipo in ('ingreso','gasto')
    -- En "sin prorrateo" se ignora el prorrateo Y sus reversiones.
    and (
      p_incluir_prorrateo
      or (
        a.tipo <> 'prorrateo'
        and not (
          a.tipo = 'reversion'
          and exists (
            select 1
              from public.asientos_anulaciones an
              join public.asientos ao on ao.id = an.asiento_id
             where an.asiento_reversion_id = a.id and ao.tipo = 'prorrateo'
          )
        )
      )
    )
  group by cc.codigo, cc.nombre, cc.tipo, left(c.codigo,2), c.tipo, s.nombre, c.codigo, c.nombre
  having sum(l.debito) - sum(l.credito) <> 0
  order by cc.codigo, c.codigo;
$function$;

-- === Mayor con opción de excluir el prorrateo (para el drill-down) ===========
-- Se reemplaza la firma de 3 args por una de 4 (con default) para que el
-- drill-down "sin prorrateo" cuadre exactamente con la celda del Estado de
-- Resultados. Con p_excluir_prorrateo = false se comporta igual que antes.
drop function if exists public.app_mayor_cuenta(uuid, date, date);
create or replace function public.app_mayor_cuenta(
  p_cuenta_id uuid,
  p_desde     date default null,
  p_hasta     date default null,
  p_excluir_prorrateo boolean default false
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
       and a.estado = 'confirmado'
       and (p_desde is null or a.fecha >= p_desde)
       and (p_hasta is null or a.fecha <= p_hasta)
       and (
         not p_excluir_prorrateo
         or (
           a.tipo <> 'prorrateo'
           and not (
             a.tipo = 'reversion'
             and exists (
               select 1
                 from public.asientos_anulaciones an
                 join public.asientos ao on ao.id = an.asiento_id
                where an.asiento_reversion_id = a.id and ao.tipo = 'prorrateo'
             )
           )
         )
       )
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
grant execute on function public.app_mayor_cuenta(uuid, date, date, boolean) to authenticated;

do $$ begin raise notice 'fix reversion-de-prorrateo aplicado (estado resultados + mayor).'; end $$;
