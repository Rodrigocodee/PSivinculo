alter table public.consultas
  add column if not exists data_consulta_solicitada_original timestamptz,
  add column if not exists respondida_em timestamptz;

alter table public.consultas
  drop constraint if exists consultas_status_check;

alter table public.consultas
  add constraint consultas_status_check
  check (
    status in (
      'solicitada',
      'pendente',
      'confirmada',
      'cancelada',
      'recusada',
      'contraproposta',
      'realizada',
      'faltou',
      'reagendada'
    )
  );

create or replace function public.respond_consulta_request(
  consulta_id_input uuid,
  action_input text,
  suggested_datetime_input timestamptz default null
)
returns public.consultas
language plpgsql
set search_path = public
as $$
declare
  target_consulta public.consultas%rowtype;
  updated_consulta public.consultas%rowtype;
  normalized_action text;
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

    if suggested_datetime_input <= timezone('utc', now()) then
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
         respondida_em = timezone('utc', now())
   where id = target_consulta.id
   returning *
    into updated_consulta;

  return updated_consulta;
end;
$$;

revoke all on function public.respond_consulta_request(uuid, text, timestamptz) from public;
grant execute on function public.respond_consulta_request(uuid, text, timestamptz) to authenticated;
