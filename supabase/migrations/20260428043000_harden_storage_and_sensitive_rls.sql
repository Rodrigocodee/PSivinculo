create or replace function public.current_request_jwt_role()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      auth.jwt() ->> 'role',
      current_setting('request.jwt.claim.role', true),
      ''
    ),
    ''
  )
$$;

create or replace function public.is_privileged_request_actor()
returns boolean
language sql
stable
as $$
  select
    coalesce(public.current_request_jwt_role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
$$;

create or replace function public.can_manage_avatar_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folder_level_one text := nullif((storage.foldername(object_name))[1], '');
  folder_level_two text := nullif((storage.foldername(object_name))[2], '');
  current_app_user_id text := coalesce(public.current_app_user_id()::text, '');
begin
  if auth.uid() is null then
    return false;
  end if;

  if folder_level_one = 'clinicas' then
    return (
      public.is_current_user_clinic_admin()
      and public.current_app_clinic_id() is not null
      and folder_level_two = public.current_app_clinic_id()::text
    );
  end if;

  return folder_level_two in (
    auth.uid()::text,
    current_app_user_id
  );
end;
$$;

create or replace function public.can_access_prontuario_attachment_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  patient_folder_id text := nullif((storage.foldername(object_name))[2], '');
  resolved_patient_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if patient_folder_id is null then
    return false;
  end if;

  begin
    resolved_patient_id := patient_folder_id::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return exists (
    select 1
    from public.pacientes p
    where p.id = resolved_patient_id
      and public.is_current_user_psychologist(p.psicologo_id)
      and p.clinica_id is not distinct from public.current_app_clinic_id()
  );
end;
$$;

update storage.buckets
set public = false
where id = 'prontuarios-anexos';

drop policy if exists "Public insert on avatars" on storage.objects;
drop policy if exists "Public update on avatars" on storage.objects;
drop policy if exists "Public delete on avatars" on storage.objects;

drop policy if exists "Authenticated insert on avatars" on storage.objects;
drop policy if exists "Authenticated update on avatars" on storage.objects;
drop policy if exists "Authenticated delete on avatars" on storage.objects;

create policy "Authenticated insert on avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and public.can_manage_avatar_object(name)
  );

create policy "Authenticated update on avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_avatar_object(name)
  )
  with check (
    bucket_id = 'avatars'
    and public.can_manage_avatar_object(name)
  );

create policy "Authenticated delete on avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_avatar_object(name)
  );

drop policy if exists "Public insert on prontuarios-anexos" on storage.objects;
drop policy if exists "Public read on prontuarios-anexos" on storage.objects;

drop policy if exists "Authenticated read on prontuarios-anexos" on storage.objects;
drop policy if exists "Authenticated insert on prontuarios-anexos" on storage.objects;
drop policy if exists "Authenticated update on prontuarios-anexos" on storage.objects;
drop policy if exists "Authenticated delete on prontuarios-anexos" on storage.objects;

create policy "Authenticated read on prontuarios-anexos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'prontuarios-anexos'
    and public.can_access_prontuario_attachment_object(name)
  );

create policy "Authenticated insert on prontuarios-anexos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'prontuarios-anexos'
    and public.can_access_prontuario_attachment_object(name)
  );

create policy "Authenticated update on prontuarios-anexos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'prontuarios-anexos'
    and public.can_access_prontuario_attachment_object(name)
  )
  with check (
    bucket_id = 'prontuarios-anexos'
    and public.can_access_prontuario_attachment_object(name)
  );

create policy "Authenticated delete on prontuarios-anexos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'prontuarios-anexos'
    and public.can_access_prontuario_attachment_object(name)
  );

drop policy if exists clinicas_owner_or_admin_update on public.clinicas;
create policy clinicas_owner_or_admin_update
  on public.clinicas
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.is_current_user_clinic_admin()
    and id = public.current_app_clinic_id()
  )
  with check (
    auth.uid() is not null
    and public.is_current_user_clinic_admin()
    and id = public.current_app_clinic_id()
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
          where p.id = consultas.paciente_id
            and (
              p.id = auth.uid()
              or lower(coalesce(p.email, '')) = public.current_auth_email()
            )
            and p.psicologo_id is not distinct from consultas.psicologo_id
            and p.clinica_id is not distinct from consultas.clinica_id
        )
        and consultas.status = 'solicitada'
        and nullif(coalesce(consultas.asaas_payment_id, ''), '') is null
        and nullif(coalesce(consultas.asaas_invoice_url, ''), '') is null
        and nullif(coalesce(consultas.asaas_bank_slip_url, ''), '') is null
        and coalesce(consultas.status_pagamento, '') in ('', 'nao_gerado')
      )
      or (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(consultas.psicologo_id)
        and consultas.clinica_id is not distinct from public.current_app_clinic_id()
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
      (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or public.is_current_user_psychologist(consultas.psicologo_id)
    )
  )
  with check (
    auth.uid() is not null
    and (
      (public.is_current_user_clinic_admin() and consultas.clinica_id = public.current_app_clinic_id())
      or (
        public.is_current_user_psychologist(consultas.psicologo_id)
        and consultas.clinica_id is not distinct from public.current_app_clinic_id()
      )
    )
  );

create or replace function public.prevent_direct_consulta_payment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged_request_actor() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(coalesce(new.asaas_payment_id, ''), '') is not null
       or nullif(coalesce(new.asaas_invoice_url, ''), '') is not null
       or nullif(coalesce(new.asaas_bank_slip_url, ''), '') is not null
       or coalesce(new.status_pagamento, '') not in ('', 'nao_gerado') then
      raise exception 'CONSULTA_PAYMENT_FIELDS_READ_ONLY';
    end if;

    return new;
  end if;

  if new.asaas_payment_id is distinct from old.asaas_payment_id
     or new.asaas_invoice_url is distinct from old.asaas_invoice_url
     or new.asaas_bank_slip_url is distinct from old.asaas_bank_slip_url
     or new.status_pagamento is distinct from old.status_pagamento then
    raise exception 'CONSULTA_PAYMENT_FIELDS_READ_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists consultas_protect_payment_fields on public.consultas;
create trigger consultas_protect_payment_fields
  before insert or update on public.consultas
  for each row
  execute function public.prevent_direct_consulta_payment_mutation();

create or replace function public.prevent_direct_sensitive_usuario_billing_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged_request_actor() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(coalesce(new.asaas_customer_id, ''), '') is not null
       or nullif(coalesce(new.asaas_subscription_id, ''), '') is not null
       or nullif(coalesce(new.plano_slug, ''), '') is not null
       or nullif(coalesce(new.status_assinatura, ''), '') is not null
       or new.valor_mensal is not null
       or new.proximo_vencimento is not null
       or nullif(coalesce(new.forma_pagamento, ''), '') is not null
       or new.assinatura_ativa is true then
      raise exception 'USUARIO_BILLING_FIELDS_READ_ONLY';
    end if;

    return new;
  end if;

  if new.asaas_customer_id is distinct from old.asaas_customer_id
     or new.asaas_subscription_id is distinct from old.asaas_subscription_id
     or new.plano_slug is distinct from old.plano_slug
     or new.status_assinatura is distinct from old.status_assinatura
     or new.valor_mensal is distinct from old.valor_mensal
     or new.proximo_vencimento is distinct from old.proximo_vencimento
     or new.forma_pagamento is distinct from old.forma_pagamento
     or new.assinatura_ativa is distinct from old.assinatura_ativa then
    raise exception 'USUARIO_BILLING_FIELDS_READ_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists usuarios_protect_sensitive_billing_fields on public.usuarios;
create trigger usuarios_protect_sensitive_billing_fields
  before insert or update on public.usuarios
  for each row
  execute function public.prevent_direct_sensitive_usuario_billing_mutation();

create or replace function public.prevent_direct_sensitive_clinica_billing_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged_request_actor() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(coalesce(new.asaas_customer_id, ''), '') is not null
       or nullif(coalesce(new.asaas_subscription_id, ''), '') is not null
       or nullif(coalesce(new.plano_slug, ''), '') is not null
       or nullif(coalesce(new.status_assinatura, ''), '') is not null
       or new.valor_mensal is not null
       or new.proximo_vencimento is not null
       or nullif(coalesce(new.forma_pagamento, ''), '') is not null
       or new.assinatura_ativa is true then
      raise exception 'CLINICA_BILLING_FIELDS_READ_ONLY';
    end if;

    return new;
  end if;

  if new.asaas_customer_id is distinct from old.asaas_customer_id
     or new.asaas_subscription_id is distinct from old.asaas_subscription_id
     or new.plano_slug is distinct from old.plano_slug
     or new.status_assinatura is distinct from old.status_assinatura
     or new.valor_mensal is distinct from old.valor_mensal
     or new.proximo_vencimento is distinct from old.proximo_vencimento
     or new.forma_pagamento is distinct from old.forma_pagamento
     or new.assinatura_ativa is distinct from old.assinatura_ativa then
    raise exception 'CLINICA_BILLING_FIELDS_READ_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists clinicas_protect_sensitive_billing_fields on public.clinicas;
create trigger clinicas_protect_sensitive_billing_fields
  before insert or update on public.clinicas
  for each row
  execute function public.prevent_direct_sensitive_clinica_billing_mutation();
