-- =============================================================================
-- Amarrar un retiro (de la lista de depósitos / QuPOS) a un PAGO DE PLANILLA.
-- Algunos retiros son pagos de salarios: al registrarlos, se paga la planilla
-- (aparece en su pantalla y baja el saldo) y el retiro queda enlazado a ese pago.
-- Reusa fn_pagar_planilla (Debe 21-10-11 salarios por pagar / Haber caja).
-- =============================================================================

alter table public.retiro_caja
  add column if not exists planilla_pago_id uuid references public.planilla_pagos(id);

create or replace function public.fn_enlazar_planilla_retiro(p_retiro uuid, p_pago uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.retiro_caja
    set planilla_pago_id = p_pago, gasto_id = null, pago_id = null, estado = 'ingresado',
        actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_enlazar_planilla_retiro(uuid, uuid) to authenticated;

-- Al volver a pendiente / na, soltar también el pago de planilla.
create or replace function public.fn_marcar_retiro(p_retiro uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_estado not in ('pendiente','ingresado','na') then raise exception 'Estado inválido.'; end if;
  update public.retiro_caja
    set estado = p_estado,
        gasto_id         = case when p_estado='ingresado' then gasto_id         else null end,
        pago_id          = case when p_estado='ingresado' then pago_id          else null end,
        planilla_pago_id = case when p_estado='ingresado' then planilla_pago_id else null end,
        actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_marcar_retiro(uuid, text) to authenticated;

-- Planillas confirmadas con saldo pendiente (para elegir cuál paga el retiro).
create or replace function public.app_planillas_pendientes()
returns table(id uuid, titulo text, fecha date, neto numeric, pagado numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.titulo, p.fecha,
    public.fn_planilla_neto(p.id) as neto,
    coalesce((select sum(pp.monto) from public.planilla_pagos pp
              where pp.planilla_id = p.id and pp.estado='confirmado'), 0) as pagado,
    round(public.fn_planilla_neto(p.id)
      - coalesce((select sum(pp.monto) from public.planilla_pagos pp
                  where pp.planilla_id = p.id and pp.estado='confirmado'), 0), 2) as saldo
  from public.planilla p
  where p.estado = 'confirmada'
    and (public.soy_administrador() or public.tengo_permiso('cierre.gestionar') or public.tengo_permiso('gastos.registrar'))
    and round(public.fn_planilla_neto(p.id)
        - coalesce((select sum(pp.monto) from public.planilla_pagos pp
                    where pp.planilla_id = p.id and pp.estado='confirmado'), 0), 2) > 0
  order by p.fecha desc;
$$;
grant execute on function public.app_planillas_pendientes() to authenticated;

-- Recrear los dos listados de retiros para exponer también el pago de planilla.
create or replace function public.fn_retiros_select() returns void language sql as $$ select 1 $$; -- no-op (marcador)

drop function if exists public.app_listar_retiros(uuid, int, int);
create function public.app_listar_retiros(p_centro uuid, p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, mov_tipo text, mov_desc text, asiento_id uuid, asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja, r.estado,
    case when r.gasto_id is not null then 'gasto'
         when r.pago_id is not null then 'pago'
         when r.planilla_pago_id is not null then 'planilla' else null end,
    case when r.gasto_id is not null then coalesce(gl.descripcion, gcta.codigo)
         when r.pago_id  is not null then 'Pago a ' || pp_prov.nombre
         when r.planilla_pago_id is not null then 'Pago planilla ' || coalesce(pl.titulo,'') end,
    coalesce(gl.asiento_id, pp.asiento_id, plp.asiento_id),
    coalesce(ga.numero, pa.numero, pla.numero),
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join public.pagos_proveedor pp on pp.id = r.pago_id
  left join public.proveedores pp_prov on pp_prov.id = pp.proveedor_id
  left join public.asientos pa on pa.id = pp.asiento_id
  left join public.planilla_pagos plp on plp.id = r.planilla_pago_id
  left join public.planilla pl on pl.id = plp.planilla_id
  left join public.asientos pla on pla.id = plp.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto
      and (g.centro_costo_id = r.centro_id or g.centro_costo_id is null)
      and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
    and r.centro_id = p_centro and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.control_caja, r.monto;
$$;
grant execute on function public.app_listar_retiros(uuid, int, int) to authenticated;

drop function if exists public.app_listar_retiros_dep(int, int);
create function public.app_listar_retiros_dep(p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, mov_tipo text, mov_desc text, asiento_id uuid, asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja, r.estado,
    case when r.gasto_id is not null then 'gasto'
         when r.pago_id is not null then 'pago'
         when r.planilla_pago_id is not null then 'planilla' else null end,
    case when r.gasto_id is not null then coalesce(gl.descripcion, gcta.codigo)
         when r.pago_id  is not null then 'Pago a ' || pp_prov.nombre
         when r.planilla_pago_id is not null then 'Pago planilla ' || coalesce(pl.titulo,'') end,
    coalesce(gl.asiento_id, pp.asiento_id, plp.asiento_id),
    coalesce(ga.numero, pa.numero, pla.numero),
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join public.pagos_proveedor pp on pp.id = r.pago_id
  left join public.proveedores pp_prov on pp_prov.id = pp.proveedor_id
  left join public.asientos pa on pa.id = pp.asiento_id
  left join public.planilla_pagos plp on plp.id = r.planilla_pago_id
  left join public.planilla pl on pl.id = plp.planilla_id
  left join public.asientos pla on pla.id = plp.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
    and r.fuente = 'depositos' and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.monto;
$$;
grant execute on function public.app_listar_retiros_dep(int, int) to authenticated;
drop function if exists public.fn_retiros_select();

do $$ begin raise notice 'retiro: pago de planilla listo.'; end $$;
