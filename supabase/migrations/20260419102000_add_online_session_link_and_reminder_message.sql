alter table public.usuarios
  add column if not exists link_sessao_online text,
  add column if not exists mensagem_lembrete_sessao text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'info_online'
  ) then
    execute '
      update public.usuarios
      set link_sessao_online = info_online
      where coalesce(link_sessao_online, '''') = ''''
        and coalesce(info_online, '''') <> ''''
    ';
  end if;
end $$;
