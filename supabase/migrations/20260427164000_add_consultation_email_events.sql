create table if not exists public.consultation_email_events (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references public.consultas(id) on delete cascade,
  tipo_evento text not null,
  destinatario_email text not null,
  status text not null default 'pending',
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint consultation_email_events_tipo_evento_check check (
    tipo_evento in (
      'reminder_12h_patient',
      'reminder_1h_patient',
      'reminder_1h_psychologist'
    )
  ),
  constraint consultation_email_events_status_check check (
    status in ('pending', 'processing', 'sent', 'failed')
  ),
  constraint consultation_email_events_consulta_evento_destinatario_key unique (
    consulta_id,
    tipo_evento,
    destinatario_email
  )
);

create index if not exists consultation_email_events_status_idx
  on public.consultation_email_events (status, criado_em desc);

alter table public.consultation_email_events enable row level security;

revoke all on public.consultation_email_events from anon, authenticated, public;
grant select, insert, update on public.consultation_email_events to service_role;
