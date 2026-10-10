# Local Attendance Tracker — Web Edition

Pure static HTML/CSS/JavaScript attendance tracker designed for GitHub Pages.

## Features
- First-run profile setup: Name, Position, Shift Start/End
- Dashboard by cutoff (6–20 and 21–5)
- Present, Late, Absent, Day Off, Leave, Holiday, Half Day
- 24-hour / military time
- Automatic late-minute calculation from Shift Start
- Manual add attendance for previous dates
- Daily Records: tap/click a record to edit full attendance details
- OT Start/End and automatic OT hours
- Search/filter records
- Cutoff history
- JSON backup and restore
- Local-only browser storage; no server/database required

## Run locally
You can open `index.html` directly in a modern browser. For best results, use a simple local HTTP server.

Example with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages
1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root. `index.html` must be in the root.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then Save.
6. Open the GitHub Pages URL shown by GitHub after deployment.

No npm install, Capacitor, Android Studio, or build process is required.

## Important data note
Attendance data is stored in that browser/device using `localStorage`. GitHub Pages only hosts the app files; it does not sync attendance between devices or browsers.

Use **Profile → Export Backup** regularly. To move your records to another browser/device, use **Import Backup** there.
