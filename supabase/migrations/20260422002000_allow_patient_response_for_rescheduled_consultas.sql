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

  if target_consulta.status not in ('contraproposta', 'reagendada') then
    raise exception 'Apenas contrapropostas ou reagendamentos pendentes podem ser respondidos por este fluxo.';
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
     set status = case
       when normalized_action = 'aceitar' and target_consulta.status = 'reagendada' then 'reagendada'
       when normalized_action = 'aceitar' then 'confirmada'
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

drop trigger if exists consultas_notify_psychologist_about_counterproposal_refusal on public.consultas;
create trigger consultas_notify_psychologist_about_counterproposal_refusal
  after update on public.consultas
  for each row
  when (
    old.status in ('contraproposta', 'reagendada')
    and new.status = 'recusada'
    and new.ultima_resposta_por = 'paciente'
  )
  execute function public.notify_psychologist_about_counterproposal_refusal();

revoke all on function public.notify_psychologist_about_counterproposal_refusal() from public;
revoke all on function public.respond_consulta_counterproposal(uuid, text) from public;
grant execute on function public.respond_consulta_counterproposal(uuid, text) to authenticated;
