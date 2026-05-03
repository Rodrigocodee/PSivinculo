create table if not exists public.admin_master_users (
  auth_user_id uuid primary key,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  revoked_at timestamptz null
);

alter table public.admin_master_users enable row level security;

revoke all on table public.admin_master_users from anon, authenticated;

create index if not exists admin_master_users_active_idx
  on public.admin_master_users (auth_user_id)
  where revoked_at is null;

create or replace function public.is_current_user_admin_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_master_users a
    where a.auth_user_id = auth.uid()
      and a.revoked_at is null
  )
$$;

revoke all on function public.is_current_user_admin_master() from public;
grant execute on function public.is_current_user_admin_master() to authenticated;
