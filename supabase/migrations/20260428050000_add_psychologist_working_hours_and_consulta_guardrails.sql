create or replace function public.default_psychologist_working_hours()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('dia_semana', 'segunda', 'ativo', true, 'hora_inicio', '08:00', 'hora_fim', '18:00'),
    jsonb_build_object('dia_semana', 'terca', 'ativo', true, 'hora_inicio', '08:00', 'hora_fim', '18:00'),
    jsonb_build_object('dia_semana', 'quarta', 'ativo', true, 'hora_inicio', '08:00', 'hora_fim', '18:00'),
    jsonb_build_object('dia_semana', 'quinta', 'ativo', true, 'hora_inicio', '08:00', 'hora_fim', '18:00'),
    jsonb_build_object('dia_semana', 'sexta', 'ativo', true, 'hora_inicio', '08:00', 'hora_fim', '18:00'),
    jsonb_build_object('dia_semana', 'sabado', 'ativo', false, 'hora_inicio', '08:00', 'hora_fim', '12:00'),
    jsonb_build_object('dia_semana', 'domingo', 'ativo', false, 'hora_inicio', '08:00', 'hora_fim', '12:00')
  );
$$;

alter table public.usuarios
  add column if not exists working_hours jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'horarios_atendimento'
  ) then
    begin
      execute $sql$
        update public.usuarios
           set working_hours = horarios_atendimento::jsonb
         where working_hours is null
           and horarios_atendimento is not null
      $sql$;
    exception
      when others then
        null;
    end;
  end if;
end $$;

create or replace function public.validate_consulta_working_hours()
returns trigger
language plpgsql
as $$
declare
  normalized_status text := lower(trim(coalesce(new.status, '')));
  normalized_psychologist_id text := trim(coalesce(new.psicologo_id::text, ''));
  psychologist_row_id text := null;
  psychologist_auth_id text := null;
  psychologist_duration_min integer := 50;
  duration_minutes integer := 50;
  day_key text;
  day_config jsonb := null;
  schedule_json jsonb := public.default_psychologist_working_hours();
  day_enabled boolean := false;
  day_start_time time := null;
  day_end_time time := null;
  appointment_start_time time := null;
  appointment_end_time time := null;
  conflicting_consulta_id text := null;
  psychologist_ids text[] := array[]::text[];
begin
  if new.data_consulta is null or normalized_status in ('cancelada', 'recusada') then
    return new;
  end if;

  if normalized_psychologist_id <> '' then
    select
      u.id::text,
      nullif(trim(coalesce(u.auth_id::text, '')), ''),
      coalesce(nullif(u.working_hours, 'null'::jsonb), public.default_psychologist_working_hours()),
      greatest(coalesce(u.duracao_consulta_min, 50), 1)
    into psychologist_row_id, psychologist_auth_id, schedule_json, psychologist_duration_min
    from public.usuarios u
    where u.id::text = normalized_psychologist_id
       or coalesce(u.auth_id::text, '') = normalized_psychologist_id
    limit 1;
  end if;

  duration_minutes := greatest(coalesce(new.duracao_consulta_min, psychologist_duration_min, 50), 1);

  day_key := case extract(dow from new.data_consulta)
    when 0 then 'domingo'
    when 1 then 'segunda'
    when 2 then 'terca'
    when 3 then 'quarta'
    when 4 then 'quinta'
    when 5 then 'sexta'
    when 6 then 'sabado'
    else ''
  end;

  select item
    into day_config
  from jsonb_array_elements(coalesce(schedule_json, public.default_psychologist_working_hours())) item
  where coalesce(nullif(trim(item->>'dia_semana'), ''), nullif(trim(item->>'key'), '')) = day_key
  limit 1;

  if day_config is null then
    raise exception 'Dia sem atendimento configurado.';
  end if;

  day_enabled := coalesce(
    nullif(day_config->>'ativo', '')::boolean,
    nullif(day_config->>'enabled', '')::boolean,
    false
  );

  if not day_enabled then
    raise exception 'Dia sem atendimento configurado.';
  end if;

  day_start_time := coalesce(
    nullif(day_config->>'hora_inicio', '')::time,
    nullif(day_config->>'start', '')::time
  );
  day_end_time := coalesce(
    nullif(day_config->>'hora_fim', '')::time,
    nullif(day_config->>'end', '')::time
  );
  appointment_start_time := new.data_consulta::time;
  appointment_end_time := (new.data_consulta + make_interval(mins => duration_minutes))::time;

  if day_start_time is null
     or day_end_time is null
     or appointment_start_time < day_start_time
     or appointment_end_time > day_end_time then
    raise exception 'Este horario esta fora da sua disponibilidade configurada.';
  end if;

  psychologist_ids := array_remove(
    array[
      normalized_psychologist_id,
      psychologist_row_id,
      psychologist_auth_id
    ],
    null
  );

  select c.id::text
    into conflicting_consulta_id
  from public.consultas c
  where coalesce(c.psicologo_id::text, '') = any(psychologist_ids)
    and coalesce(c.id::text, '') <> coalesce(new.id::text, '')
    and lower(trim(coalesce(c.status, ''))) not in ('cancelada', 'recusada')
    and c.data_consulta is not null
    and c.data_consulta < (new.data_consulta + make_interval(mins => duration_minutes))
    and (c.data_consulta + make_interval(mins => greatest(coalesce(c.duracao_consulta_min, psychologist_duration_min, 50), 1))) > new.data_consulta
  limit 1;

  if conflicting_consulta_id is not null then
    raise exception 'Ja existe outra consulta neste horario.';
  end if;

  return new;
end;
$$;

drop trigger if exists consultas_validate_working_hours on public.consultas;

create trigger consultas_validate_working_hours
before insert or update of psicologo_id, data_consulta, status, duracao_consulta_min
on public.consultas
for each row
execute function public.validate_consulta_working_hours();
