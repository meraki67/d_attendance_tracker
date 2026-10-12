-- V19 Role Hierarchy + Admin User Management
-- Run once in Supabase Dashboard > SQL Editor BEFORE uploading the V19 web patch.
-- Roles: user < admin < super_admin
-- IMPORTANT: At the bottom, replace YOUR_SUPER_ADMIN_EMAIL@example.com with the email
-- that should be the one protected Super Admin, then run that UPDATE once.

alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists role text not null default 'user';

do $$ begin
  alter table public.profiles add constraint profiles_role_check
  check (role in ('user','admin','super_admin'));
exception when duplicate_object then null;
end $$;

-- Enforce at most one Super Admin at database level.
create unique index if not exists profiles_single_super_admin_idx
on public.profiles (role)
where role = 'super_admin';

-- Browser clients may update normal profile columns, but never role/email directly.
revoke update on table public.profiles from authenticated;
grant update (name, position, shift_type, shift_start, shift_end, day_offs, avatar_data, theme, updated_at)
on public.profiles to authenticated;

-- Backfill emails for accounts created before V19.
update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where p.user_id = u.id
  and coalesce(p.email,'') = '';

-- Helper functions run as the database owner so RLS checks do not recurse.
create or replace function public.current_attendance_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'user');
$$;

create or replace function public.is_attendance_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_attendance_role() in ('admin','super_admin');
$$;

create or replace function public.is_attendance_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_attendance_role() = 'super_admin';
$$;

revoke all on function public.current_attendance_role() from public;
revoke all on function public.is_attendance_admin() from public;
revoke all on function public.is_attendance_super_admin() from public;
grant execute on function public.current_attendance_role() to authenticated;
grant execute on function public.is_attendance_admin() to authenticated;
grant execute on function public.is_attendance_super_admin() to authenticated;

-- Rebuild profile RLS. Users can edit only their own normal profile fields.
-- Admin-wide edits go through the protected RPC below.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or public.is_attendance_admin());

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()) and role = 'user');

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and role = public.current_attendance_role()
);

-- No direct authenticated DELETE policy on profiles. Admin deletion uses the RPC below.

-- Admin/Super Admin can edit app profiles. Admin cannot touch Super Admin.
-- No one can create a second Super Admin through the web UI/RPC.
create or replace function public.admin_update_attendance_profile(
  p_user_id uuid,
  p_name text,
  p_position text,
  p_shift_type text,
  p_shift_start time,
  p_shift_end time,
  p_day_offs integer[],
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  caller_role := public.current_attendance_role();
  if caller_role not in ('admin','super_admin') then
    raise exception 'Admin access required';
  end if;

  select role into target_role from public.profiles where user_id = p_user_id;
  if target_role is null then raise exception 'Profile not found'; end if;

  if target_role = 'super_admin' and caller_role <> 'super_admin' then
    raise exception 'Super Admin is protected';
  end if;

  if p_role not in ('user','admin') then
    raise exception 'Only User or Admin may be assigned from the app';
  end if;

  if p_shift_type not in ('day','night') then
    raise exception 'Invalid shift type';
  end if;

  update public.profiles
  set name = trim(coalesce(p_name,'')),
      position = trim(coalesce(p_position,'')),
      shift_type = p_shift_type,
      shift_start = p_shift_start,
      shift_end = p_shift_end,
      day_offs = coalesce(p_day_offs,'{}'),
      role = case when target_role = 'super_admin' then 'super_admin' else p_role end,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_update_attendance_profile(uuid,text,text,text,time,time,integer[],text) from public;
grant execute on function public.admin_update_attendance_profile(uuid,text,text,text,time,time,integer[],text) to authenticated;

-- Deletes the app profile + attendance records, NOT auth.users.
-- The existing account-integrity check then blocks that Auth account from logging into the app.
create or replace function public.admin_delete_attendance_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  caller_role := public.current_attendance_role();
  if caller_role not in ('admin','super_admin') then
    raise exception 'Admin access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own active admin profile';
  end if;

  select role into target_role from public.profiles where user_id = p_user_id;
  if target_role is null then raise exception 'Profile not found'; end if;
  if target_role = 'super_admin' then raise exception 'Super Admin cannot be deleted'; end if;

  delete from public.attendance where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_attendance_profile(uuid) from public;
grant execute on function public.admin_delete_attendance_profile(uuid) to authenticated;

-- Update V15 signup trigger so all NEW registrations store email + default to User.
create or replace function public.handle_new_attendance_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id, name, position, email, role,
    shift_type, shift_start, shift_end, day_offs, avatar_data, theme
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', ''),
    coalesce(new.email, ''),
    'user',
    'day', '06:00', '15:00', '{}', '', 'light'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- INITIAL SUPER ADMIN (RUN AFTER replacing the email below)
-- This intentionally does NOT auto-select someone. You choose the one protected account.
update public.profiles
set role = 'super_admin', updated_at = now()
where lower(email) = lower('YOUR_SUPER_ADMIN_EMAIL@example.com');
