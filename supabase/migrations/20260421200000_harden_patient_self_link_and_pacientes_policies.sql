create or replace function public.current_patient_linked_psychologist_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.psicologo_id
  from public.pacientes p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = public.current_auth_email()
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.current_patient_linked_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.clinica_id
  from public.pacientes p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = public.current_auth_email()
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.register_self_patient_with_invite(
  invite_code_input text,
  nome_input text default null,
  telefone_input text default null,
  cpf_input text default null
)
returns table (
  id uuid,
  clinica_id uuid,
  psicologo_id uuid,
  nome text,
  email text,
  telefone text,
  cpf text,
  ativo boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_user_id uuid := auth.uid();
  resolved_email text := public.current_auth_email();
  resolved_invite_code text := upper(trim(coalesce(invite_code_input, '')));
  invited_psychologist_id uuid;
  invited_clinic_id uuid;
  existing_patient public.pacientes%rowtype;
begin
  if resolved_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if resolved_email = '' then
    raise exception 'AUTH_EMAIL_REQUIRED';
  end if;

  if resolved_invite_code = '' then
    raise exception 'PATIENT_INVITE_CODE_REQUIRED';
  end if;

  select
    u.id,
    c.id
  into
    invited_psychologist_id,
    invited_clinic_id
  from public.usuarios u
  left join public.clinicas c
    on c.id = u.clinica_id
  where upper(trim(coalesce(u.codigo_convite, ''))) = resolved_invite_code
  limit 1;

  if invited_psychologist_id is null then
    raise exception 'PATIENT_INVITE_NOT_FOUND';
  end if;

  select p.*
  into existing_patient
  from public.pacientes p
  where p.id = resolved_user_id
     or lower(coalesce(p.email, '')) = resolved_email
  order by case when p.id = resolved_user_id then 0 else 1 end
  limit 1;

  if existing_patient.id is not null
     and existing_patient.psicologo_id is not null
     and existing_patient.psicologo_id <> invited_psychologist_id then
    raise exception 'PATIENT_ALREADY_LINKED_TO_ANOTHER_PSYCHOLOGIST';
  end if;

  return query
  insert into public.pacientes (
    id,
    clinica_id,
    psicologo_id,
    nome,
    email,
    telefone,
    cpf,
    ativo
  )
  values (
    resolved_user_id,
    invited_clinic_id,
    invited_psychologist_id,
    nullif(trim(coalesce(nome_input, '')), ''),
    resolved_email,
    nullif(trim(coalesce(telefone_input, '')), ''),
    nullif(regexp_replace(coalesce(cpf_input, ''), '\D', '', 'g'), ''),
    true
  )
  on conflict on constraint pacientes_pkey do update
    set clinica_id = excluded.clinica_id,
        psicologo_id = excluded.psicologo_id,
        nome = coalesce(excluded.nome, public.pacientes.nome),
        email = excluded.email,
        telefone = coalesce(excluded.telefone, public.pacientes.telefone),
        cpf = coalesce(excluded.cpf, public.pacientes.cpf),
        ativo = true
  returning
    public.pacientes.id,
    public.pacientes.clinica_id,
    public.pacientes.psicologo_id,
    public.pacientes.nome::text,
    lower(coalesce(public.pacientes.email, ''))::text,
    public.pacientes.telefone::text,
    public.pacientes.cpf::text,
    public.pacientes.ativo;
end;
$$;

grant execute on function public.register_self_patient_with_invite(text, text, text, text) to authenticated;

drop policy if exists pacientes_scoped_insert on public.pacientes;
create policy pacientes_scoped_insert
  on public.pacientes
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(psicologo_id)
        and clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

drop policy if exists pacientes_scoped_update on public.pacientes;
create policy pacientes_scoped_update
  on public.pacientes
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      lower(coalesce(email, '')) = public.current_auth_email()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  )
  with check (
    auth.uid() is not null
    and (
      (
        lower(coalesce(email, '')) = public.current_auth_email()
        and psicologo_id is not distinct from public.current_patient_linked_psychologist_id()
        and clinica_id is not distinct from public.current_patient_linked_clinic_id()
      )
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(psicologo_id)
        and clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );
