alter table public.clinicas
  add column if not exists codigo_convite varchar(16);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinicas'
      and column_name = 'invite_code'
  ) then
    execute $sql$
      update public.clinicas
      set codigo_convite = upper(btrim(invite_code))
      where codigo_convite is null
        and invite_code is not null
        and btrim(invite_code) <> ''
    $sql$;
  end if;
end $$;

update public.clinicas
set codigo_convite = upper(btrim(codigo_convite))
where codigo_convite is not null;

drop index if exists clinicas_codigo_convite_unique_idx;

create unique index if not exists clinicas_codigo_convite_unique_idx
  on public.clinicas (upper(codigo_convite))
  where codigo_convite is not null;

alter table public.clinicas
  drop constraint if exists clinicas_codigo_convite_format_check;

alter table public.clinicas
  add constraint clinicas_codigo_convite_format_check
  check (
    codigo_convite is null
    or codigo_convite ~ '^[A-Z0-9-]{4,16}$'
  );
