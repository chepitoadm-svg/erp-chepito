-- Préstamo Banco Popular, Operación 131-017-006194-9 (deuda a largo plazo).
-- Constituido 09/12/2025, anterior al arranque del ERP (apertura 30/06/2026),
-- por lo que su saldo inicial se registra como depuración de saldos.
-- Aquí solo se agregan las cuentas del catálogo; el asiento de saldo inicial
-- se postea con fn_postear_asiento (dato operativo, no esquema).

insert into public.cuentas (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, estado, subtipo_codigo)
select v.codigo, v.nombre, v.nivel, v.tipo, v.naturaleza, v.acepta_movimiento, v.estado, v.subtipo_codigo
from (values
  ('22-10-06-00-00', 'DOCUMENTOS POR PAGAR BANCO POPULAR', 3, 'pasivo', 'acreedora', false, 'activo', 'P002'),
  ('22-10-06-01-00', 'OP # 131-017-006194-9',             4, 'pasivo', 'acreedora', true,  'activo', 'P002')
) as v(codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, estado, subtipo_codigo)
where not exists (select 1 from public.cuentas x where x.codigo = v.codigo);

update public.cuentas c
   set cuenta_padre_id = p.id
  from public.cuentas p
 where p.codigo = public.fn_cuenta_codigo_padre(c.codigo)
   and c.codigo in ('22-10-06-00-00', '22-10-06-01-00')
   and c.cuenta_padre_id is distinct from p.id;
