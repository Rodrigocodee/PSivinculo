alter table public.consultas
  add column if not exists ultima_resposta_por text,
  add column if not exists contraproposta_enviada_em timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consultas_ultima_resposta_por_check'
  ) then
    alter table public.consultas
      add constraint consultas_ultima_resposta_por_check
      check (
        ultima_resposta_por is null
        or ultima_resposta_por in ('psicologo', 'paciente')
      );
  end if;
end $$;

create or replace function public.resolve_patient_notification_destination_user_id(target_paciente_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_patient_email text;
  resolved_user_id uuid;
begin
  if target_paciente_id is null then
    return null;
  end if;

  if exists (
    select 1
    from auth.users au
    where au.id = target_paciente_id
  ) then
    return target_paciente_id;
  end if;

  select lower(coalesce(p.email, ''))
    into target_patient_email
  from public.pacientes p
  where p.id = target_paciente_id
  limit 1;

  if coalesce(target_patient_email, '') = '' then
    return null;
  end if;

  select au.id
    into resolved_user_id
  from auth.users au
  where lower(coalesce(au.email, '')) = target_patient_email
  order by au.created_at asc
  limit 1;

  return resolved_user_id;
end;
$$;

create or replace function public.respond_consulta_request(
  consulta_id_input uuid,
  action_input text,
  suggested_datetime_input timestamptz default null
)
returns public.consultas
language plpgsql
security definer
set search_path = public
as $$
declare
  target_consulta public.consultas%rowtype;
  updated_consulta public.consultas%rowtype;
  normalized_action text;
  response_timestamp timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Nao foi possivel identificar o usuario autenticado para responder a solicitacao.';
  end if;

  normalized_action := lower(trim(coalesce(action_input, '')));

  if normalized_action not in ('confirmar', 'recusar', 'sugerir_outro_horario') then
    raise exception 'Acao de resposta invalida para a solicitacao de consulta.';
  end if;

  select *
    into target_consulta
  from public.consultas
  where id = consulta_id_input
  for update;

  if not found then
    raise exception 'Nao foi possivel localizar a solicitacao de consulta informada.';
  end if;

  if target_consulta.psicologo_id is null then
    raise exception 'Nao foi possivel localizar o psicologo responsavel por esta solicitacao.';
  end if;

  if not public.is_current_user_psychologist(target_consulta.psicologo_id) then
    raise exception 'Apenas o psicologo responsavel pode responder esta solicitacao.';
  end if;

  if target_consulta.clinica_id is distinct from public.current_app_clinic_id() then
    raise exception 'A solicitacao informada nao pertence ao contexto atual da clinica.';
  end if;

  if target_consulta.status is distinct from 'solicitada' then
    raise exception 'Apenas solicitacoes com status solicitada podem ser respondidas por este fluxo.';
  end if;

  if normalized_action = 'sugerir_outro_horario' then
    if suggested_datetime_input is null then
      raise exception 'Informe a nova data e horario para registrar a contraproposta.';
    end if;

    if suggested_datetime_input <= response_timestamp then
      raise exception 'A contraproposta precisa apontar para um horario futuro.';
    end if;

    if suggested_datetime_input = target_consulta.data_consulta then
      raise exception 'Escolha um horario diferente do solicitado originalmente para registrar a contraproposta.';
    end if;
  elsif suggested_datetime_input is not null then
    raise exception 'A nova data e horario so podem ser enviados ao sugerir outro horario.';
  end if;

  update public.consultas
     set status = case normalized_action
       when 'confirmar' then 'confirmada'
       when 'recusar' then 'recusada'
       else 'contraproposta'
     end,
         data_consulta = case
           when normalized_action = 'sugerir_outro_horario' then suggested_datetime_input
           else target_consulta.data_consulta
         end,
         data_consulta_solicitada_original = coalesce(
           target_consulta.data_consulta_solicitada_original,
           target_consulta.data_consulta
         ),
         respondida_em = response_timestamp,
         ultima_resposta_por = 'psicologo',
         contraproposta_enviada_em = case
           when normalized_action = 'sugerir_outro_horario' then response_timestamp
           else target_consulta.contraproposta_enviada_em
         end
   where id = target_consulta.id
   returning *
    into updated_consulta;

  return updated_consulta;
end;
$$;

create or replace function public.respond_consulta_counterproposal(
  consulta_id_input uuid,
  action_input text
)
returns public.consultas
language plpgsql
security definer
set search_path = public
as $$
declare
  target_consulta public.consultas%rowtype;
  updated_consulta public.consultas%rowtype;
  normalized_action text;
  response_timestamp timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'Nao foi possivel identificar o usuario autenticado para responder a contraproposta.';
  end if;

  normalized_action := lower(trim(coalesce(action_input, '')));

  if normalized_action not in ('aceitar', 'recusar') then
    raise exception 'Acao invalida para responder a contraproposta de consulta.';
  end if;

  select *
    into target_consulta
  from public.consultas
  where id = consulta_id_input
  for update;

  if not found then
    raise exception 'Nao foi possivel localizar a consulta informada.';
  end if;

  if target_consulta.status is distinct from 'contraproposta' then
    raise exception 'Apenas contrapropostas pendentes podem ser respondidas por este fluxo.';
  end if;

  if not exists (
    select 1
    from public.pacientes p
    where p.id = target_consulta.paciente_id
      and (
        p.id = auth.uid()
        or lower(coalesce(p.email, '')) = public.current_auth_email()
      )
  ) then
    raise exception 'Apenas o paciente titular pode responder esta contraproposta.';
  end if;

  if target_consulta.psicologo_id is distinct from public.current_patient_linked_psychologist_id() then
    raise exception 'A consulta informada nao pertence ao psicologo vinculado ao seu cadastro.';
  end if;

  if target_consulta.clinica_id is distinct from public.current_patient_linked_clinic_id() then
    raise exception 'A consulta informada nao pertence ao contexto atual do seu cadastro.';
  end if;

  if normalized_action = 'aceitar'
     and coalesce(target_consulta.data_consulta, response_timestamp - interval '1 minute') <= response_timestamp then
    raise exception 'O horario sugerido ja nao esta mais disponivel para confirmacao.';
  end if;

  update public.consultas
     set status = case normalized_action
       when 'aceitar' then 'confirmada'
       else 'recusada'
     end,
         respondida_em = response_timestamp,
         ultima_resposta_por = 'paciente'
   where id = target_consulta.id
   returning *
    into updated_consulta;

  return updated_consulta;
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

drop trigger if exists consultas_notify_patient_about_response on public.consultas;
create trigger consultas_notify_patient_about_response
  after update on public.consultas
  for each row
  when (new.status in ('confirmada', 'recusada', 'contraproposta'))
  execute function public.notify_patient_about_consulta_response();

revoke all on function public.resolve_patient_notification_destination_user_id(uuid) from public;
revoke all on function public.notify_patient_about_consulta_response() from public;
revoke all on function public.respond_consulta_request(uuid, text, timestamptz) from public;
grant execute on function public.respond_consulta_request(uuid, text, timestamptz) to authenticated;
revoke all on function public.respond_consulta_counterproposal(uuid, text) from public;
grant execute on function public.respond_consulta_counterproposal(uuid, text) to authenticated;
