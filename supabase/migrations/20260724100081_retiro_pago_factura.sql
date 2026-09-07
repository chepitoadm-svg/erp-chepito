-- =============================================================================
-- Permitir saldar un retiro de caja PAGANDO una factura del proveedor (CxP) que
-- ya está en el sistema, desde la pantalla de retiros. El retiro queda amarrado
-- al pago (pagos_proveedor) para saber que esa factura ya se pagó y ver su
-- asiento. Reusa fn_crear_pago + fn_confirmar_pago (medio efectivo, de caja).
-- =============================================================================

alter table public.retiro_caja
  add column if not exists pago_id uuid references public.pagos_proveedor(id);

-- Amarra el retiro a un pago de proveedor ya confirmado.
create or replace function public.fn_enlazar_pago_retiro(p_retiro uuid, p_pago uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  update public.retiro_caja
    set pago_id = p_pago, gasto_id = null, estado = 'ingresado',
        actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_enlazar_pago_retiro(uuid, uuid) to authenticated;

-- Al volver a pendiente / na, soltar tanto el gasto como el pago enlazados.
create or replace function public.fn_marcar_retiro(p_retiro uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_permiso('cierre.gestionar') then raise exception 'No tenés permiso.'; end if;
  if p_estado not in ('pendiente','ingresado','na') then raise exception 'Estado inválido.'; end if;
  update public.retiro_caja
    set estado = p_estado,
        gasto_id = case when p_estado='ingresado' then gasto_id else null end,
        pago_id  = case when p_estado='ingresado' then pago_id  else null end,
        actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_retiro;
end $$;
grant execute on function public.fn_marcar_retiro(uuid, text) to authenticated;

-- Facturas por pagar pendientes (saldo > 0), con proveedor, para elegir cuál
-- salda el retiro.
create or replace function public.app_cxp_pendientes()
returns table(id uuid, proveedor_id uuid, proveedor_nombre text, fecha date, vence date, consecutivo text, saldo numeric)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.proveedor_id, pr.nombre, cp.fecha, cp.fecha_vencimiento, fc.consecutivo, cp.saldo
  from public.cuentas_por_pagar cp
  join public.proveedores pr on pr.id = cp.proveedor_id
  left join public.facturas_compra fc on fc.id = cp.factura_id
  where cp.saldo > 0 and cp.estado <> 'anulada'
    and (public.soy_administrador() or public.tengo_permiso('cierre.gestionar') or public.tengo_permiso('compras.pagar'))
  order by pr.nombre, cp.fecha;
$$;
grant execute on function public.app_cxp_pendientes() to authenticated;

-- Recrear el listado de retiros para exponer el asiento venga de gasto o de pago.
drop function if exists public.app_listar_retiros(uuid, int, int);
create function public.app_listar_retiros(p_centro uuid, p_anio int, p_mes int)
returns table(
  id uuid, fecha date, control_caja text, monto numeric, motivo text, cajero text, caja text,
  estado text, mov_tipo text, mov_desc text, asiento_id uuid, asiento_numero int,
  sug_gasto_id uuid, sug_fecha date, sug_desc text, sug_dif_dias int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.fecha, r.control_caja, r.monto, r.motivo, r.cajero, r.caja, r.estado,
    case when r.gasto_id is not null then 'gasto' when r.pago_id is not null then 'pago' else null end,
    case when r.gasto_id is not null then coalesce(gl.descripcion, gcta.codigo)
         when r.pago_id  is not null then 'Pago a ' || pp_prov.nombre end,
    coalesce(gl.asiento_id, pp.asiento_id),
    coalesce(ga.numero, pa.numero),
    s.id, s.fecha, coalesce(s.descripcion, scta.codigo), abs(s.fecha - r.fecha)
  from public.retiro_caja r
  left join public.gastos gl on gl.id = r.gasto_id
  left join public.cuentas gcta on gcta.id = gl.cuenta_gasto_id
  left join public.asientos ga on ga.id = gl.asiento_id
  left join public.pagos_proveedor pp on pp.id = r.pago_id
  left join public.proveedores pp_prov on pp_prov.id = pp.proveedor_id
  left join public.asientos pa on pa.id = pp.asiento_id
  left join lateral (
    select g.id, g.fecha, g.descripcion, g.cuenta_gasto_id
    from public.gastos g
    join public.cuentas cp on cp.id = g.cuenta_pago_id and cp.codigo like '11-10-10-%'
    where g.estado <> 'anulado' and g.total = r.monto
      and (g.centro_costo_id = r.centro_id or g.centro_costo_id is null)
      and abs(g.fecha - r.fecha) <= 5
      and not exists (select 1 from public.retiro_caja r2 where r2.gasto_id = g.id)
    order by abs(g.fecha - r.fecha), g.fecha
    limit 1
  ) s on r.estado = 'pendiente'
  left join public.cuentas scta on scta.id = s.cuenta_gasto_id
  where (public.soy_administrador() or public.tengo_permiso('cierre.gestionar'))
    and r.centro_id = p_centro and r.anio = p_anio and r.mes = p_mes
  order by r.fecha, r.control_caja, r.monto;
$$;
grant execute on function public.app_listar_retiros(uuid, int, int) to authenticated;

do $$ begin raise notice 'retiro: pago de factura de proveedor listo.'; end $$;
