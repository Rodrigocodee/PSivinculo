do $$
declare
  psychologist_table text;
begin
  foreach psychologist_table in array array['usuarios', 'psicologos', 'profiles']
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = psychologist_table
        and column_name = 'modalidade_consulta'
    ) then
      execute format(
        $sql$
          update public.%I
             set modalidade_consulta = case
               when lower(trim(coalesce(modalidade_consulta, ''))) in ('presencial', 'online', 'hibrido')
                 then lower(trim(coalesce(modalidade_consulta, '')))
               when lower(trim(coalesce(modalidade_consulta, ''))) in (
                 'ambos',
                 'presencial_e_online',
                 'presencial e online',
                 'online_e_presencial',
                 'online e presencial',
                 'both',
                 'hybrid',
                 'hibrido_presencial_online'
               )
                 then 'hibrido'
               else 'hibrido'
             end
           where modalidade_consulta is null
              or lower(trim(coalesce(modalidade_consulta, ''))) not in ('presencial', 'online', 'hibrido')
        $sql$,
        psychologist_table
      );

      execute format(
        'alter table public.%I alter column modalidade_consulta set default ''hibrido''',
        psychologist_table
      );

      execute format(
        'alter table public.%I drop constraint if exists %I',
        psychologist_table,
        psychologist_table || '_modalidade_consulta_check'
      );

      execute format(
        'alter table public.%I add constraint %I check (modalidade_consulta in (''presencial'', ''online'', ''hibrido''))',
        psychologist_table,
        psychologist_table || '_modalidade_consulta_check'
      );
    end if;
  end loop;
end $$;
