create or replace function public.notify_psychologist_about_counterproposal_refusal()
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
begin
  if old.status is distinct from 'contraproposta' then
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

  resolved_destination_user_id := public.resolve_notification_destination_user_id(new.psicologo_id);

  if resolved_destination_user_id is null then
    raise exception 'Nao foi possivel localizar o usuario destino da notificacao para a recusa da contraproposta.';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = resolved_destination_user_id
  ) then
    raise exception 'Nao foi possivel localizar a conta autenticavel do psicologo responsavel por esta contraproposta.';
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
    'consulta_contraproposta_recusada',
    'Contraproposta recusada',
    format(
      '%s recusou a contraproposta para %s as %s.',
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

drop trigger if exists consultas_notify_psychologist_about_counterproposal_refusal on public.consultas;
create trigger consultas_notify_psychologist_about_counterproposal_refusal
  after update on public.consultas
  for each row
  when (
    old.status = 'contraproposta'
    and new.status = 'recusada'
    and new.ultima_resposta_por = 'paciente'
  )
  execute function public.notify_psychologist_about_counterproposal_refusal();

revoke all on function public.notify_psychologist_about_counterproposal_refusal() from public;
