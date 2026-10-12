-- V29: Repair self-profile update permissions/RLS.
-- Run once in Supabase SQL Editor.

alter table public.profiles enable row level security;

-- Keep browser users away from sensitive role/email columns.
revoke update on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;
grant insert on table public.profiles to authenticated;

grant update (
  name,
  position,
  shift_type,
  shift_start,
  shift_end,
  day_offs,
  avatar_data,
  theme,
  updated_at
) on table public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and role = public.current_attendance_role()
);

-- Keep existing own/admin read access intact.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_attendance_admin()
);
