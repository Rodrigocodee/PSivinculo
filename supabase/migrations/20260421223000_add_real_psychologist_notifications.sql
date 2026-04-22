create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id_destino uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensagem text not null,
  rota_destino text not null,
  entidade_tipo text not null,
  entidade_id uuid not null,
  lida boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notificacoes_tipo_not_blank_check check (btrim(tipo) <> ''),
  constraint notificacoes_titulo_not_blank_check check (btrim(titulo) <> ''),
  constraint notificacoes_mensagem_not_blank_check check (btrim(mensagem) <> ''),
  constraint notificacoes_rota_destino_not_blank_check check (btrim(rota_destino) <> ''),
  constraint notificacoes_entidade_tipo_not_blank_check check (btrim(entidade_tipo) <> '')
);

create index if not exists notificacoes_usuario_id_destino_created_at_idx
  on public.notificacoes (usuario_id_destino, created_at desc);

create index if not exists notificacoes_usuario_id_destino_lida_created_at_idx
  on public.notificacoes (usuario_id_destino, lida, created_at desc);

create index if not exists notificacoes_entidade_tipo_entidade_id_idx
  on public.notificacoes (entidade_tipo, entidade_id);

revoke all on table public.notificacoes from anon, authenticated;
grant select on table public.notificacoes to authenticated;

alter table public.notificacoes enable row level security;

drop policy if exists notificacoes_destinatario_select on public.notificacoes;
create policy notificacoes_destinatario_select
  on public.notificacoes
  for select
  to authenticated
  using (
    auth.uid() is not null
    and usuario_id_destino = auth.uid()
  );

create or replace function public.resolve_notification_destination_user_id(target_psicologo_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(u.auth_id, u.id)
      from public.usuarios u
      where u.id = target_psicologo_id
         or u.auth_id = target_psicologo_id
      order by case when u.auth_id = target_psicologo_id then 0 else 1 end
      limit 1
    ),
    target_psicologo_id
  )
$$;

create or replace function public.mark_my_notifications_as_read(notification_ids_input uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao foi possivel identificar o usuario autenticado para marcar notificacoes como lidas.';
  end if;

  if coalesce(array_length(notification_ids_input, 1), 0) = 0 then
    return;
  end if;

  return query
    update public.notificacoes n
       set lida = true
     where n.usuario_id_destino = auth.uid()
       and n.id = any(notification_ids_input)
       and n.lida = false
    returning n.id;
end;
$$;

grant execute on function public.mark_my_notifications_as_read(uuid[]) to authenticated;

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

drop trigger if exists consultas_notify_psychologist_about_request on public.consultas;
create trigger consultas_notify_psychologist_about_request
  after insert on public.consultas
  for each row
  when (new.status = 'solicitada')
  execute function public.notify_psychologist_about_consulta_request();
