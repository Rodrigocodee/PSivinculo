alter table public.pacientes
  add column if not exists link_sessao_online_paciente text,
  add column if not exists link_sessao_online_psicologo text,
  add column if not exists link_sessao_online_atualizado_em timestamptz;
