-- Corrige o tamanho das colunas de convite do psicologo para evitar truncamento.
-- O formato controlado em aplicacao passa a ser PSI-XXXXXX ou PSI-XXXXXXXX.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'codigo_convite'
  ) then
    execute $sql$
      alter table public.usuarios
      alter column codigo_convite
      type varchar(16)
      using upper(btrim(codigo_convite))
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'invite_code'
  ) then
    execute $sql$
      alter table public.usuarios
      alter column invite_code
      type varchar(16)
      using upper(btrim(invite_code))
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'psicologos'
      and column_name = 'codigo_convite'
  ) then
    execute $sql$
      alter table public.psicologos
      alter column codigo_convite
      type varchar(16)
      using upper(btrim(codigo_convite))
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'psicologos'
      and column_name = 'invite_code'
  ) then
    execute $sql$
      alter table public.psicologos
      alter column invite_code
      type varchar(16)
      using upper(btrim(invite_code))
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'codigo_convite'
  ) then
    execute $sql$
      alter table public.profiles
      alter column codigo_convite
      type varchar(16)
      using upper(btrim(codigo_convite))
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'invite_code'
  ) then
    execute $sql$
      alter table public.profiles
      alter column invite_code
      type varchar(16)
      using upper(btrim(invite_code))
    $sql$;
  end if;
end $$;
