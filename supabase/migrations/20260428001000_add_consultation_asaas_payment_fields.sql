alter table public.consultas
  add column if not exists valor_consulta numeric(10,2),
  add column if not exists asaas_payment_id text,
  add column if not exists asaas_invoice_url text,
  add column if not exists asaas_bank_slip_url text,
  add column if not exists status_pagamento text default 'nao_gerado';

update public.consultas
set status_pagamento = 'nao_gerado'
where status_pagamento is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consultas_status_pagamento_check'
  ) then
    alter table public.consultas
      add constraint consultas_status_pagamento_check
      check (
        status_pagamento in (
          'nao_gerado',
          'aguardando_pagamento',
          'pago',
          'vencido',
          'cancelado',
          'erro'
        )
      );
  end if;
end $$;

create index if not exists consultas_status_pagamento_idx
  on public.consultas (status_pagamento, data_consulta desc);
