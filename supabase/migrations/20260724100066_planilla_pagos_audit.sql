-- El trigger de auditoría escribe NEW.actualizado_en/por en cada UPDATE; la tabla
-- planilla_pagos no las tenía. Se agregan para que el trigger funcione.
alter table public.planilla_pagos add column if not exists actualizado_en timestamptz;
alter table public.planilla_pagos add column if not exists actualizado_por uuid;
do $$ begin raise notice 'planilla_pagos audit cols listas.'; end $$;
