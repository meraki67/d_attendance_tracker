# Attendance Tracker V12

GitHub Pages web app with Supabase login/cloud sync.

## V12 additions
- Change profile avatar (JPG/PNG/WebP; compressed to 256x256 before cloud save)
- Light/Dark theme saved per user and remembered locally
- Military-time dropdowns for Shift Start/End, Time In/Out, and OT Start/End
- Time dropdown uses 5-minute choices from 00:00 to 23:55
- Existing exact times (for example 06:02) remain supported and are not rounded
- V11 modern responsive desktop sidebar + centered mobile navigation retained

## IMPORTANT: existing Supabase project
Before uploading V12, run `supabase/v12-upgrade.sql` once in Supabase Dashboard > SQL Editor. This adds `avatar_data` and `theme` to `profiles`.

## GitHub Pages update
Upload/replace the V12 files in your existing repository. If your existing `js/config.js` already contains the correct Supabase Project URL and publishable key, keep that configured file rather than replacing it with a placeholder.
