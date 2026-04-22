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
    c.id as clinica_id,
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

grant execute on function public.lookup_public_psychologist_invite(text) to anon, authenticated;
