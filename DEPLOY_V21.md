# V21 one-time backend deployment

Your website remains on GitHub Pages. Only the secure user-management function runs on Supabase.

## 1. GitHub Pages files
Upload/replace:
- `index.html`
- `css/style.css`
- `js/app.js`

Do **not** put secret/service-role keys in `js/config.js`.

## 2. Deploy the Supabase Edge Function

Open Windows PowerShell in the folder that contains the `supabase` folder from this patch.

Run:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref tdeoresckkskohfhqyhy
npx supabase@latest functions deploy admin-manage-user
```

Supabase will open/ask for authentication during `login`.

The hosted Edge Function automatically receives Supabase's protected server environment variables, including the service-role key. Do not copy the service-role key into GitHub.

## 3. What works after deployment

From the app's Admin > User Management page, an Admin can:
- Add a User or Admin
- Edit name and position
- Edit email
- Change User <-> Admin role
- Edit Day/Night shift and exact 24-hour shift times
- Edit weekly day off
- Set a new temporary password
- Permanently delete a user's Auth account, profile, and attendance data

The protected root account remains internally protected but displays as **Admin** in the UI.

## 4. Test

1. Sign in as Admin.
2. Open **Users**.
3. Click **+ Add User**.
4. Create a test user.
5. Sign out and confirm the test user can log in.
6. Sign back in as Admin and edit/delete the test account.

If Add User shows `Function not found`, the Edge Function has not been deployed yet.
