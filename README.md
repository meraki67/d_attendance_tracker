# Local Attendance Tracker — Web Edition

Pure static HTML/CSS/JavaScript attendance tracker designed for GitHub Pages.

## Features
- First-run setup: Name and Position only
- Manage Schedule in Profile: Day/Night shift, editable Shift Start/End, weekly Day Off selection
- Default Day preset: 06:00–15:00; Night preset: 18:00–03:00 (both editable)
- Day Off suggestion when manually adding attendance on a configured regular day off
- Dashboard by cutoff (6–20 and 21–5)
- Present, Late, Absent, Day Off, Leave, Holiday, Half Day
- 24-hour / military time
- Automatic late-minute calculation from configured Shift Start
- Manual add attendance for previous dates
- Daily Records: tap/click a record to edit full attendance details
- OT Start/End and automatic OT hours
- Search/filter records
- Cutoff history
- JSON backup and restore
- Local-only browser storage; no server/database required

## Run locally
Open `index.html` directly in a modern browser, or use a simple local HTTP server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages
1. Create a GitHub repository.
2. Upload all files from this folder to the repository root.
3. Go to **Settings → Pages**.
4. Choose **Deploy from a branch**.
5. Select `main` and `/(root)` then Save.

## Important data note
Attendance data is stored in that browser/device using `localStorage`. GitHub Pages hosts the app but does not sync data between devices. Use **Profile → Export Backup** regularly.
