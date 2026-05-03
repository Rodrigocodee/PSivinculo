alter table public.consultation_email_events
  drop constraint if exists consultation_email_events_tipo_evento_check;

alter table public.consultation_email_events
  add constraint consultation_email_events_tipo_evento_check check (
    tipo_evento in (
      'reminder_12h_patient',
      'reminder_1h_patient',
      'reminder_1h_psychologist',
      'payment_pending_patient',
      'payment_confirmed_patient'
    )
  );
