-- =============================================================================
-- Estado de Resultados con la estructura estándar (CR): separa Costo de ventas
-- de los Gastos de operación y permite los subtotales Utilidad bruta / de
-- operación / antes de impuestos. Clasifica cada cuenta de resultado en una
-- sección por su primer segmento de código, y devuelve el monto con el efecto
-- correcto (ingreso = crédito−débito, gasto = débito−crédito), de modo que las
-- devoluciones/contra-cuentas salen en negativo dentro de su sección.
--   41            -> ingresos_operacion
--   51            -> costo_ventas
--   61, 62        -> gastos_operacion   (operativos + financieros)
--   42, 43, 52    -> otros_ingresos
--   63, 64        -> otros_gastos
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
    and (p_incluir_prorrateo or a.tipo <> 'prorrateo')
  group by cc.codigo, cc.nombre, cc.tipo, left(c.codigo,2), c.tipo, s.nombre, c.codigo, c.nombre
  having sum(l.debito) - sum(l.credito) <> 0
  order by cc.codigo, c.codigo;
$function$;

do $$ begin raise notice 'fn_estado_resultados con secciones listo.'; end $$;
