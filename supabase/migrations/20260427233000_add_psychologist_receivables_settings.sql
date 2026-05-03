alter table public.usuarios
  add column if not exists tipo_recebimento text not null default 'externo',
  add column if not exists asaas_wallet_id text,
  add column if not exists percentual_repasse numeric(5,2) not null default 90;

update public.usuarios
set tipo_recebimento = 'externo'
where tipo_recebimento is null;

update public.usuarios
set percentual_repasse = 90
where percentual_repasse is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_tipo_recebimento_check'
  ) then
    alter table public.usuarios
      add constraint usuarios_tipo_recebimento_check
      check (tipo_recebimento in ('externo', 'asaas_split'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_percentual_repasse_check'
  ) then
    alter table public.usuarios
      add constraint usuarios_percentual_repasse_check
      check (percentual_repasse >= 0 and percentual_repasse <= 100);
  end if;
end
$$;
