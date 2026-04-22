alter table if exists public.assinaturas_asaas
  add constraint assinaturas_asaas_owner_type_check
    check (owner_type is null or owner_type in ('user', 'clinic'));

alter table if exists public.assinaturas_asaas
  add constraint assinaturas_asaas_owner_target_check
    check (
      owner_type is null
      or (owner_type = 'user' and auth_user_id is not null)
      or (owner_type = 'clinic' and clinica_id is not null)
    );

create index if not exists assinaturas_asaas_owner_user_idx
  on public.assinaturas_asaas (owner_type, auth_user_id);

create index if not exists assinaturas_asaas_owner_clinic_idx
  on public.assinaturas_asaas (owner_type, clinica_id);
