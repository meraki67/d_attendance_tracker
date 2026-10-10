-- Attendance Tracker V12 upgrade
-- Run this once in Supabase > SQL Editor if your database was created using V8-V11 schema.
alter table public.profiles add column if not exists avatar_data text not null default '';
alter table public.profiles add column if not exists theme text not null default 'light';
do $$ begin
  alter table public.profiles add constraint profiles_theme_check check (theme in ('light','dark'));
exception when duplicate_object then null;
end $$;
