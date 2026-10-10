-- Attendance Tracker V8 - Supabase setup
-- Run once in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  position text not null default '',
  shift_type text not null default 'day' check (shift_type in ('day','night')),
  shift_start time not null default '06:00',
  shift_end time not null default '15:00',
  day_offs integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('Present','Absent','Day Off','Leave','Holiday','Half Day')),
  time_in time,
  time_out time,
  has_ot boolean not null default false,
  ot_start time,
  ot_end time,
  remarks text not null default '',
  entry_type text not null default 'manual',
  manually_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.profiles enable row level security;
alter table public.attendance enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.attendance from anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.attendance to authenticated;

-- Separate policies per operation.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "attendance_select_own" on public.attendance;
create policy "attendance_select_own" on public.attendance for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "attendance_insert_own" on public.attendance;
create policy "attendance_insert_own" on public.attendance for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "attendance_update_own" on public.attendance;
create policy "attendance_update_own" on public.attendance for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "attendance_delete_own" on public.attendance;
create policy "attendance_delete_own" on public.attendance for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists attendance_user_date_idx on public.attendance(user_id, date desc);
