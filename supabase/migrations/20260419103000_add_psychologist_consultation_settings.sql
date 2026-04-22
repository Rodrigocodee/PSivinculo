do $$
declare
  psychologist_table text;
begin
  foreach psychologist_table in array array['usuarios', 'psicologos', 'profiles']
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = psychologist_table
    ) then
      execute format(
        'alter table public.%I
          add column if not exists valor_consulta numeric(10,2),
          add column if not exists duracao_consulta_min integer not null default 50,
          add column if not exists modalidade_consulta varchar(20) not null default ''ambos'',
          add column if not exists atende_presencial boolean not null default true,
          add column if not exists atende_online boolean not null default true,
          add column if not exists local_presencial text,
          add column if not exists info_online text',
        psychologist_table
      );

      execute format(
        $sql$
          update public.%I
             set modalidade_consulta = case
               when lower(trim(coalesce(modalidade_consulta, ''))) in ('presencial', 'online', 'ambos')
                 then lower(trim(coalesce(modalidade_consulta, '')))
               when lower(trim(coalesce(modalidade_consulta, ''))) in (
                 'presencial_e_online',
                 'presencial e online',
                 'online_e_presencial',
                 'online e presencial'
               )
                 then 'ambos'
               else 'ambos'
             end
           where modalidade_consulta is null
              or lower(trim(coalesce(modalidade_consulta, ''))) not in ('presencial', 'online', 'ambos')
        $sql$,
        psychologist_table
      );

      execute format(
        'alter table public.%I
          alter column modalidade_consulta set default ''ambos''',
        psychologist_table
      );

      if not exists (
        select 1
        from pg_constraint
        where conname = format('%s_valor_consulta_check', psychologist_table)
      ) then
        execute format(
          'alter table public.%I
            add constraint %I
            check (valor_consulta is null or valor_consulta >= 0)',
          psychologist_table,
          psychologist_table || '_valor_consulta_check'
        );
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = format('%s_duracao_consulta_min_check', psychologist_table)
      ) then
        execute format(
          'alter table public.%I
            add constraint %I
            check (duracao_consulta_min > 0)',
          psychologist_table,
          psychologist_table || '_duracao_consulta_min_check'
        );
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = format('%s_modalidade_consulta_check', psychologist_table)
      ) then
        execute format(
          'alter table public.%I
            add constraint %I
            check (modalidade_consulta in (''presencial'', ''online'', ''ambos''))',
          psychologist_table,
          psychologist_table || '_modalidade_consulta_check'
        );
      end if;
    end if;
  end loop;
end $$;

alter table public.consultas
  add column if not exists modalidade varchar(20);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consultas_modalidade_check'
  ) then
    alter table public.consultas
      add constraint consultas_modalidade_check
      check (modalidade is null or modalidade in ('presencial', 'online'));
  end if;
end $$;
