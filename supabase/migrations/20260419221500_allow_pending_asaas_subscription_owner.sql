alter table if exists public.assinaturas_asaas
  alter column owner_type drop default,
  alter column owner_type drop not null;
