-- V15 Account Integrity
-- Run once in Supabase Dashboard > SQL Editor.
-- New Auth users automatically get a public.profiles row.
-- If a profile is later deleted, the web app will block login instead of recreating it.

create or replace function public.handle_new_attendance_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id,
    name,
    position,
    shift_type,
    shift_start,
    shift_end,
    day_offs,
    avatar_data,
    theme
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'position', ''),
    'day',
    '06:00',
    '15:00',
    '{}',
    '',
    'light'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_attendance_profile on auth.users;
create trigger on_auth_user_created_attendance_profile
after insert on auth.users
for each row execute procedure public.handle_new_attendance_user();
