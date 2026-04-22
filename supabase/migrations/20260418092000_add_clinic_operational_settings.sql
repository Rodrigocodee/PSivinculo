alter table public.clinicas
  add column if not exists notificacao_lembrete_consulta boolean not null default true,
  add column if not exists notificacao_confirmacao_agendamento boolean not null default true,
  add column if not exists notificacao_cancelamento boolean not null default true,
  add column if not exists notificacao_relatorio_semanal boolean not null default false,
  add column if not exists template_mensagem_confirmacao text,
  add column if not exists template_mensagem_lembrete text,
  add column if not exists prazo_minimo_cancelamento_horas integer,
  add column if not exists percentual_cobranca_cancelamento numeric(5,2),
  add column if not exists duracao_padrao_sessao_min integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinicas_prazo_minimo_cancelamento_horas_check'
  ) then
    alter table public.clinicas
      add constraint clinicas_prazo_minimo_cancelamento_horas_check
      check (
        prazo_minimo_cancelamento_horas is null
        or prazo_minimo_cancelamento_horas >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinicas_percentual_cobranca_cancelamento_check'
  ) then
    alter table public.clinicas
      add constraint clinicas_percentual_cobranca_cancelamento_check
      check (
        percentual_cobranca_cancelamento is null
        or (
          percentual_cobranca_cancelamento >= 0
          and percentual_cobranca_cancelamento <= 100
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinicas_duracao_padrao_sessao_min_check'
  ) then
    alter table public.clinicas
      add constraint clinicas_duracao_padrao_sessao_min_check
      check (
        duracao_padrao_sessao_min is null
        or duracao_padrao_sessao_min > 0
      );
  end if;
end $$;
