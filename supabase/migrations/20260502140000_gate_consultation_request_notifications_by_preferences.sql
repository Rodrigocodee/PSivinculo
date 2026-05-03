create or replace function public.psychologist_notification_preference_enabled(
  target_psicologo_id uuid,
  preference_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(u.notification_preferences) = 'object'
          and u.notification_preferences ? preference_key
          and jsonb_typeof(u.notification_preferences -> preference_key) = 'boolean'
          then (u.notification_preferences ->> preference_key)::boolean
        else null
      end
      from public.usuarios u
      where u.id = target_psicologo_id
         or u.auth_id = target_psicologo_id
      order by case when u.id = target_psicologo_id then 0 else 1 end
      limit 1
    ),
    case preference_key
      when 'weekly_reports' then false
      else true
    end
  )
$$;

create or replace function public.notify_psychologist_about_consulta_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_destination_user_id uuid;
  patient_name text;
  scheduled_date_label text;
  scheduled_time_label text;
  is_patient_owned_request boolean;
begin
  if new.status is distinct from 'solicitada' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from public.pacientes p
    where p.id = new.paciente_id
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = public.current_auth_email()
      )
  )
  into is_patient_owned_request;

  if not coalesce(is_patient_owned_request, false) then
    return new;
  end if;

  if new.psicologo_id is null then
    raise exception 'Nao foi possivel localizar o psicologo responsavel por esta solicitacao.';
  end if;

  if not public.psychologist_notification_preference_enabled(new.psicologo_id, 'patient_confirmation') then
    return new;
  end if;

  resolved_destination_user_id := public.resolve_notification_destination_user_id(new.psicologo_id);

  if resolved_destination_user_id is null then
    raise exception 'Nao foi possivel localizar o usuario destino da notificacao para a solicitacao de consulta.';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = resolved_destination_user_id
  ) then
    raise exception 'Nao foi possivel localizar a conta autenticavel do psicologo responsavel por esta solicitacao.';
  end if;

  select coalesce(nullif(trim(p.nome), ''), 'Paciente')
    into patient_name
  from public.pacientes p
  where p.id = new.paciente_id
  limit 1;

  scheduled_date_label := to_char(new.data_consulta, 'DD/MM/YYYY');
  scheduled_time_label := to_char(new.data_consulta, 'HH24:MI');

  insert into public.notificacoes (
    usuario_id_destino,
    tipo,
    titulo,
    mensagem,
    rota_destino,
    entidade_tipo,
    entidade_id
  )
  values (
    resolved_destination_user_id,
    'consulta_solicitada',
    'Nova solicitacao de consulta',
    format(
      '%s solicitou horario para %s as %s.',
      coalesce(patient_name, 'Paciente'),
      scheduled_date_label,
      scheduled_time_label
    ),
    format('/psi/agenda?consultaId=%s&data=%s', new.id, to_char(new.data_consulta, 'YYYY-MM-DD')),
    'consulta',
    new.id
  );

  return new;
end;
$$;

create or replace function public.notify_patient_about_consulta_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_destination_user_id uuid;
  psychologist_name text;
  original_datetime timestamptz;
  current_date_label text;
  current_time_label text;
  original_date_label text;
  original_time_label text;
begin
  if new.ultima_resposta_por is distinct from 'psicologo' then
    return new;
  end if;

  if new.status not in ('confirmada', 'recusada', 'contraproposta') then
    return new;
  end if;

  if old.status is not distinct from new.status
     and old.data_consulta is not distinct from new.data_consulta
     and old.ultima_resposta_por is not distinct from new.ultima_resposta_por then
    return new;
  end if;

  if not public.psychologist_notification_preference_enabled(new.psicologo_id, 'patient_confirmation') then
    return new;
  end if;

  resolved_destination_user_id := public.resolve_patient_notification_destination_user_id(new.paciente_id);

  if resolved_destination_user_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(u.nome), ''), 'Seu psicologo')
    into psychologist_name
  from public.usuarios u
  where u.id = new.psicologo_id
     or u.auth_id = new.psicologo_id
  order by case when u.id = new.psicologo_id then 0 else 1 end
  limit 1;

  original_datetime := coalesce(
    new.data_consulta_solicitada_original,
    old.data_consulta,
    new.data_consulta
  );
  current_date_label := to_char(new.data_consulta, 'DD/MM/YYYY');
  current_time_label := to_char(new.data_consulta, 'HH24:MI');
  original_date_label := to_char(original_datetime, 'DD/MM/YYYY');
  original_time_label := to_char(original_datetime, 'HH24:MI');

  insert into public.notificacoes (
    usuario_id_destino,
    tipo,
    titulo,
    mensagem,
    rota_destino,
    entidade_tipo,
    entidade_id
  )
  values (
    resolved_destination_user_id,
    case new.status
      when 'confirmada' then 'consulta_confirmada'
      when 'recusada' then 'consulta_recusada'
      else 'consulta_contraproposta'
    end,
    case new.status
      when 'confirmada' then 'Consulta confirmada'
      when 'recusada' then 'Solicitacao recusada'
      else 'Novo horario sugerido'
    end,
    case new.status
      when 'confirmada' then format(
        '%s confirmou sua consulta para %s as %s.',
        coalesce(psychologist_name, 'Seu psicologo'),
        current_date_label,
        current_time_label
      )
      when 'recusada' then format(
        '%s recusou sua solicitacao para %s as %s.',
        coalesce(psychologist_name, 'Seu psicologo'),
        original_date_label,
        original_time_label
      )
      else case
        when original_datetime is not null and original_datetime is distinct from new.data_consulta then format(
          '%s sugeriu %s as %s no lugar de %s as %s.',
          coalesce(psychologist_name, 'Seu psicologo'),
          current_date_label,
          current_time_label,
          original_date_label,
          original_time_label
        )
        else format(
          '%s sugeriu um novo horario para %s as %s.',
          coalesce(psychologist_name, 'Seu psicologo'),
          current_date_label,
          current_time_label
        )
      end
    end,
    format('/paciente/agendamentos?consultaId=%s', new.id),
    'consulta',
    new.id
  );

  return new;
end;
$$;

create or replace function public.notify_psychologist_about_counterproposal_refusal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destination_user_id uuid;
  patient_name text;
  target_psychologist_user_id uuid;
  appointment_date_label text;
  appointment_time_label text;
begin
  if old.status not in ('contraproposta', 'reagendada') then
    return new;
  end if;

  if new.status is distinct from 'recusada' then
    return new;
  end if;

  if new.ultima_resposta_por is distinct from 'paciente' then
    return new;
  end if;

  if new.psicologo_id is null then
    raise exception 'Nao foi possivel localizar o psicologo responsavel por esta contraproposta.';
  end if;

  if not public.psychologist_notification_preference_enabled(new.psicologo_id, 'patient_confirmation') then
    return new;
  end if;

  target_psychologist_user_id := public.resolve_notification_destination_user_id(new.psicologo_id);
  destination_user_id := coalesce(target_psychologist_user_id, new.psicologo_id);

  if destination_user_id is null then
    raise exception 'Nao foi possivel localizar o usuario destino da notificacao para a recusa da contraproposta.';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = destination_user_id
  ) then
    raise exception 'Nao foi possivel localizar a conta autenticavel do psicologo responsavel por esta contraproposta.';
  end if;

  select coalesce(nullif(trim(p.nome), ''), 'O paciente')
    into patient_name
  from public.pacientes p
  where p.id = new.paciente_id
  limit 1;

  appointment_date_label := to_char(new.data_consulta, 'DD/MM/YYYY');
  appointment_time_label := to_char(new.data_consulta, 'HH24:MI');

  insert into public.notificacoes (
    usuario_id_destino,
    tipo,
    titulo,
    mensagem,
    rota_destino,
    entidade_tipo,
    entidade_id
  )
  values (
    destination_user_id,
    case old.status
      when 'reagendada' then 'consulta_reagendamento_recusado'
      else 'consulta_contraproposta_recusada'
    end,
    case old.status
      when 'reagendada' then 'Reagendamento recusado'
      else 'Contraproposta recusada'
    end,
    case old.status
      when 'reagendada' then format(
        '%s recusou o reagendamento para %s as %s.',
        coalesce(patient_name, 'O paciente'),
        appointment_date_label,
        appointment_time_label
      )
      else format(
        '%s recusou a contraproposta para %s as %s.',
        coalesce(patient_name, 'O paciente'),
        appointment_date_label,
        appointment_time_label
      )
    end,
    format(
      '/psi/agenda?consultaId=%s&data=%s',
      new.id,
      to_char(new.data_consulta, 'YYYY-MM-DD')
    ),
    'consulta',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.psychologist_notification_preference_enabled(uuid, text) from public;
revoke all on function public.notify_psychologist_about_consulta_request() from public;
revoke all on function public.notify_patient_about_consulta_response() from public;
revoke all on function public.notify_psychologist_about_counterproposal_refusal() from public;
