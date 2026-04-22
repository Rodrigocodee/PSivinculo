alter table public.clinicas
  add column if not exists notificacao_lembrete_consulta boolean not null default true,
  add column if not exists notificacao_confirmacao_agendamento boolean not null default true,
  add column if not exists notificacao_cancelamento boolean not null default true,
  add column if not exists notificacao_relatorio_semanal boolean not null default false;
