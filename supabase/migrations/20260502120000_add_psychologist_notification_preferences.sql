alter table public.usuarios
  add column if not exists notification_preferences jsonb not null default '{
    "appointment_reminder": true,
    "patient_confirmation": true,
    "payments": true,
    "weekly_reports": false
  }'::jsonb;

update public.usuarios
set notification_preferences = '{
  "appointment_reminder": true,
  "patient_confirmation": true,
  "payments": true,
  "weekly_reports": false
}'::jsonb
where notification_preferences is null
   or jsonb_typeof(notification_preferences) <> 'object';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_notification_preferences_object_check'
  ) then
    alter table public.usuarios
      add constraint usuarios_notification_preferences_object_check
      check (jsonb_typeof(notification_preferences) = 'object');
  end if;
end
$$;
