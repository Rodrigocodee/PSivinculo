create table if not exists public.psychologist_invites (
  invite_code varchar(16) primary key,
  user_id text not null,
  psychologist_id text not null,
  clinic_id text,
  clinic_name text,
  psychologist_name text,
  email text,
  professional_access_granted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists psychologist_invites_user_id_idx
  on public.psychologist_invites (user_id);

create index if not exists psychologist_invites_psychologist_id_idx
  on public.psychologist_invites (psychologist_id);

create unique index if not exists psychologist_invites_email_unique_idx
  on public.psychologist_invites (lower(email))
  where email is not null;

create or replace function public.set_psychologist_invites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_psychologist_invites_updated_at
on public.psychologist_invites;

create trigger set_psychologist_invites_updated_at
before update on public.psychologist_invites
for each row
execute function public.set_psychologist_invites_updated_at();

alter table public.psychologist_invites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'psychologist_invites'
      and policyname = 'Public can read psychologist invites'
  ) then
    create policy "Public can read psychologist invites"
      on public.psychologist_invites
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'psychologist_invites'
      and policyname = 'Psychologists can insert their own invites'
  ) then
    create policy "Psychologists can insert their own invites"
      on public.psychologist_invites
      for insert
      to authenticated
      with check (auth.uid()::text = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'psychologist_invites'
      and policyname = 'Psychologists can update their own invites'
  ) then
    create policy "Psychologists can update their own invites"
      on public.psychologist_invites
      for update
      to authenticated
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'psychologist_invites'
      and policyname = 'Psychologists can delete their own invites'
  ) then
    create policy "Psychologists can delete their own invites"
      on public.psychologist_invites
      for delete
      to authenticated
      using (auth.uid()::text = user_id);
  end if;
end
$$;
