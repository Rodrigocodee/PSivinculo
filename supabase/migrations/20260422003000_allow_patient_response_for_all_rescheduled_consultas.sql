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

revoke all on function public.respond_consulta_counterproposal(uuid, text) from public;
grant execute on function public.respond_consulta_counterproposal(uuid, text) to authenticated;
