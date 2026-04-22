alter table public.usuarios
  add column if not exists origem_cadastro text;

alter table public.usuarios
  drop constraint if exists usuarios_origem_cadastro_check;

alter table public.usuarios
  add constraint usuarios_origem_cadastro_check
  check (
    origem_cadastro is null
    or origem_cadastro in ('clinica_convite', 'cadastro_psicologo')
  );

create index if not exists usuarios_origem_cadastro_idx
  on public.usuarios (origem_cadastro)
  where origem_cadastro is not null;
