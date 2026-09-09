-- Nombrar las operaciones de préstamo con la entidad adelante, para
-- distinguirlas de un vistazo en el Estado de Situación (antes solo "OP # ...").
update public.cuentas set nombre = 'BAC OP # 204006504'          where codigo = '22-10-04-11-00';
update public.cuentas set nombre = 'BAC OP # 295040689'          where codigo = '22-10-04-12-00';
update public.cuentas set nombre = 'MONGE OP # 00170'            where codigo = '22-10-05-01-00';
update public.cuentas set nombre = 'POPULAR OP # 131-017-006194-9' where codigo = '22-10-06-01-00';
