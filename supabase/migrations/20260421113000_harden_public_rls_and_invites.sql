create or replace function public.current_auth_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.usuarios u
  where u.auth_id = auth.uid() or u.id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.clinica_id
  from public.usuarios u
  where u.auth_id = auth.uid() or u.id = auth.uid()
  limit 1
$$;

create or replace function public.is_current_user_clinic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where (u.auth_id = auth.uid() or u.id = auth.uid())
      and u.clinica_id is not null
      and lower(coalesce(u.tipo_usuario, '')) in (
        'admin_clinica',
        'adminclinica',
        'administradorclinica',
        'administradordeclinica',
        'clinicadmin',
        'clinicadministrator'
      )
  )
$$;

create or replace function public.is_current_user_clinic_member(target_clinica_id uuid)
returns boolean
language sql
stable
as $$
  select target_clinica_id is not null
    and public.current_app_clinic_id() = target_clinica_id
$$;

create or replace function public.is_current_user_psychologist(target_psicologo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_psicologo_id is not null
    and exists (
      select 1
      from public.usuarios u
      where (u.auth_id = auth.uid() or u.id = auth.uid())
        and lower(coalesce(u.tipo_usuario, '')) in (
          'psicologo',
          'psicologa',
          'psychologist',
          'therapist'
        )
        and (
          u.id = target_psicologo_id
          or u.auth_id = target_psicologo_id
          or auth.uid() = target_psicologo_id
        )
    )
$$;

create or replace function public.can_current_user_access_patient(target_paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_paciente_id is not null
    and exists (
      select 1
      from public.pacientes p
      where p.id = target_paciente_id
        and (
          p.id = auth.uid()
          or lower(coalesce(p.email, '')) = public.current_auth_email()
          or (public.is_current_user_clinic_admin() and p.clinica_id = public.current_app_clinic_id())
          or public.is_current_user_psychologist(p.psicologo_id)
        )
    )
$$;

create or replace function public.lookup_public_clinic_invite(invite_code_input text)
returns table (
  id uuid,
  nome text,
  codigo_convite text,
  invite_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.nome::text,
    c.codigo_convite::text,
    c.codigo_convite::text as invite_code
  from public.clinicas c
  where upper(trim(coalesce(c.codigo_convite, ''))) = upper(trim(coalesce(invite_code_input, '')))
  limit 1
$$;

drop function if exists public.lookup_public_psychologist_invite(text);

create or replace function public.lookup_public_psychologist_invite(invite_code_input text)
returns table (
  id uuid,
  clinica_id uuid,
  nome text,
  email text,
  codigo_convite text,
  nome_clinica text,
  assinatura_ativa boolean,
  status_assinatura text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.clinica_id,
    u.nome::text,
    lower(coalesce(u.email, ''))::text as email,
    u.codigo_convite::text,
    c.nome::text as nome_clinica,
    u.assinatura_ativa,
    u.status_assinatura::text
  from public.usuarios u
  left join public.clinicas c on c.id = u.clinica_id
  where upper(trim(coalesce(u.codigo_convite, ''))) = upper(trim(coalesce(invite_code_input, '')))
  limit 1
$$;

grant execute on function public.lookup_public_clinic_invite(text) to anon, authenticated;
grant execute on function public.lookup_public_psychologist_invite(text) to anon, authenticated;

revoke all on table public.assinaturas_asaas from anon, authenticated;

revoke all on table public.usuarios from anon, authenticated;
grant select, insert, update on table public.usuarios to authenticated;

revoke all on table public.clinicas from anon, authenticated;
grant select, insert, update on table public.clinicas to authenticated;

revoke all on table public.pacientes from anon, authenticated;
grant select, insert, update on table public.pacientes to authenticated;

revoke all on table public.consultas from anon, authenticated;
grant select, insert, update on table public.consultas to authenticated;

revoke all on table public.pagamentos from anon, authenticated;
grant select, insert, update on table public.pagamentos to authenticated;

revoke all on table public.prontuarios from anon, authenticated;
grant select, insert, update on table public.prontuarios to authenticated;

alter table public.assinaturas_asaas enable row level security;
alter table public.usuarios enable row level security;
alter table public.clinicas enable row level security;
alter table public.pacientes enable row level security;
alter table public.consultas enable row level security;
alter table public.pagamentos enable row level security;
alter table public.prontuarios enable row level security;

drop policy if exists usuarios_self_or_admin_select on public.usuarios;
create policy usuarios_self_or_admin_select
  on public.usuarios
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      auth_id = auth.uid()
      or id = auth.uid()
      or lower(coalesce(email, '')) = public.current_auth_email()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
    )
  );

drop policy if exists usuarios_self_insert on public.usuarios;
create policy usuarios_self_insert
  on public.usuarios
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (auth_id = auth.uid() or id = auth.uid())
  );

drop policy if exists usuarios_self_or_admin_update on public.usuarios;
create policy usuarios_self_or_admin_update
  on public.usuarios
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      auth_id = auth.uid()
      or id = auth.uid()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
    )
  )
  with check (
    auth.uid() is not null
    and (
      auth_id = auth.uid()
      or id = auth.uid()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
    )
  );

drop policy if exists clinicas_member_or_owner_select on public.clinicas;
create policy clinicas_member_or_owner_select
  on public.clinicas
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      id = public.current_app_clinic_id()
      or lower(coalesce(email, '')) = public.current_auth_email()
    )
  );

drop policy if exists clinicas_owner_insert on public.clinicas;
create policy clinicas_owner_insert
  on public.clinicas
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and lower(coalesce(email, '')) = public.current_auth_email()
  );

drop policy if exists clinicas_owner_or_admin_update on public.clinicas;
create policy clinicas_owner_or_admin_update
  on public.clinicas
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      id = public.current_app_clinic_id()
      or lower(coalesce(email, '')) = public.current_auth_email()
    )
  )
  with check (
    auth.uid() is not null
    and (
      id = public.current_app_clinic_id()
      or lower(coalesce(email, '')) = public.current_auth_email()
    )
  );

drop policy if exists pacientes_scoped_select on public.pacientes;
create policy pacientes_scoped_select
  on public.pacientes
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      id = auth.uid()
      or lower(coalesce(email, '')) = public.current_auth_email()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  );

drop policy if exists pacientes_scoped_insert on public.pacientes;
create policy pacientes_scoped_insert
  on public.pacientes
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      lower(coalesce(email, '')) = public.current_auth_email()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
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
      lower(coalesce(email, '')) = public.current_auth_email()
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(psicologo_id)
        and clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

drop policy if exists consultas_scoped_select on public.consultas;
create policy consultas_scoped_select
  on public.consultas
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(paciente_id)
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  );

drop policy if exists consultas_scoped_insert on public.consultas;
create policy consultas_scoped_insert
  on public.consultas
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      (
        exists (
          select 1
          from public.pacientes p
          where p.id = paciente_id
            and (
              p.id = auth.uid()
              or lower(coalesce(p.email, '')) = public.current_auth_email()
            )
            and p.psicologo_id is not distinct from psicologo_id
            and p.clinica_id is not distinct from clinica_id
        )
      )
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(psicologo_id)
        and clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

drop policy if exists consultas_scoped_update on public.consultas;
create policy consultas_scoped_update
  on public.consultas
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(paciente_id)
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  )
  with check (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(paciente_id)
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(psicologo_id)
        and clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

drop policy if exists pagamentos_scoped_select on public.pagamentos;
create policy pagamentos_scoped_select
  on public.pagamentos
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      public.can_current_user_access_patient(paciente_id)
      or (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  );

drop policy if exists pagamentos_scoped_insert on public.pagamentos;
create policy pagamentos_scoped_insert
  on public.pagamentos
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

drop policy if exists pagamentos_scoped_update on public.pagamentos;
create policy pagamentos_scoped_update
  on public.pagamentos
  for update
  to authenticated
  using (
    auth.uid() is not null
    and (
      (public.is_current_user_clinic_admin() and clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(psicologo_id)
    )
  )
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

drop policy if exists prontuarios_scoped_select on public.prontuarios;
create policy prontuarios_scoped_select
  on public.prontuarios
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.is_current_user_psychologist(psicologo_id)
  );

drop policy if exists prontuarios_scoped_insert on public.prontuarios;
create policy prontuarios_scoped_insert
  on public.prontuarios
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      public.is_current_user_psychologist(psicologo_id)
      and clinica_id is not distinct from public.current_app_clinic_id()
    )
  );

drop policy if exists prontuarios_scoped_update on public.prontuarios;
create policy prontuarios_scoped_update
  on public.prontuarios
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.is_current_user_psychologist(psicologo_id)
  )
  with check (
    auth.uid() is not null
    and (
      public.is_current_user_psychologist(psicologo_id)
      and clinica_id is not distinct from public.current_app_clinic_id()
    )
  );
