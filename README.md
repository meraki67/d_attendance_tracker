# Attendance Tracker V8 — GitHub Pages + Supabase

This version replaces the startup profile screen with **Login / Register** and stores each user's profile, schedule, attendance and OT records in Supabase so the same account can be used on different devices.

## 1. Create a Supabase project
Create a project in Supabase, then open **SQL Editor** and run the complete file:

`supabase/schema.sql`

The schema enables Row Level Security. Logged-in users can only access rows whose `user_id` matches their own Supabase Auth ID.

## 2. Copy your browser-safe Supabase credentials
In Supabase Dashboard, copy your:

- Project URL
- Publishable key (or legacy `anon` key)

Do **not** put a `service_role` or secret key in this GitHub Pages app.

Edit `js/config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  key: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

## 3. Configure Auth
In Supabase Authentication settings:

- Email/password sign-in must be enabled.
- If Email Confirmation is ON, new users must confirm the email before logging in.
- Add your GitHub Pages URL to the allowed Site URL / Redirect URLs if you use email confirmation links.

## 4. Upload to GitHub Pages
Replace the old repo files with the contents of this folder and commit to your Pages branch/root.

No npm install or build command is needed.

## Included
- Login / Register
- Persistent login session
- Per-user cloud-synced attendance
- Profile + Position
- Day / Night schedule
- Weekly Day Off manager
- Present / Late / Absent / Day Off / Leave / Holiday / Half Day
- OT start/end and total hours
- Previous-date manual attendance
- Editable Daily Records
- Cutoff dashboard and history
- JSON export/import
- Logout
- Clear current user's attendance data

## Existing local-only data
V7 localStorage records are **not automatically uploaded**. Export them from the old V7 app first, then use **Import Backup** after logging into V8.
