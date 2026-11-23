# Using CyberPlanner

Use the sidebar to move between the dashboard, calendar, quest board, notes, library, shop, and profile. The double arrows expand or minimize the sidebar.

## Daily planning

The dashboard combines a calendar, daily quests, routines, and notes. Routines default to morning before noon and night from noon using your device's local time; switch tabs whenever you like. The affirmation changes with the local date.

On the calendar, switch between day, week, and month, select a date, or use **Today**. The selected day's built-in and synced tasks appear alongside Google Calendar events. Day view separates all-day events from its 24-hour timeline. You can add events to writable calendars and edit an event's title and time; edits to a recurring event apply only to the selected occurrence. Use **Refresh** to pick up external changes. Calendars shared with free/busy-only access cannot show event details.

Choose **Add journal** on the dashboard or calendar to edit a journal entry for the selected day. Journal entries are separate from notes, and the calendar marks dates with entries. On the dashboard or notes page, save your note before using **Previous day** or **Next day**, or confirm that you want to discard changes.

Google sync and weekly protocol are on the calendar page. Google Calendar requires the additional API and permissions described in the [setup guide](setup.md).

## Quests, achievements, and rewards

Built-in daily quests, routines, and synced tasks are side quests worth 10 points each. On the quest board, create side quests, main quests, and end-game bosses with a rarity and point value. Completing a custom quest awards its points and equal XP once; deleting it does not remove earned points or XP.

Your profile shows level, lifetime XP, activity, and achievements. Every 100 XP gains a level. Lifetime XP includes earned task points and one-time achievement XP; spending points does not lower it. Achievement XP is separate from the spendable balance.

Achievements can be created or edited with a target, rarity, XP, and optional personal reward. Most are self-reported: use **Unlock** or **+1 progress**, and observe any stated time limits yourself. For automatic consecutive-day tracking, choose a morning or night routine task. Streaks use the server's local date, so configure its time zone to match yours. Unlocked badges and earned XP remain even if checks are removed or an achievement is deleted. Changing an unfinished achievement's tracking method or routine task resets its progress.

In **Shop**, choose a reward and select **Redeem** to spend points. Purchases require confirmation and cannot be refunded.

## Library

Place EPUB and PDF files in `ebooks/`, and M4B audiobooks in `audiblebooks/`; subfolders are supported. Refresh the page after adding or removing files. Search by title or folder, or filter by format. The featured book is randomly selected from the current matches.

EPUBs open in the built-in reader, PDFs in a browser tab, and compatible M4Bs in the browser with chapters when available. Shelf covers are loaded as books enter view; books without an image use a placeholder. EPUB and audiobook positions and bookmarks are saved in PostgreSQL; PDFs have no app-managed progress. **Details** can rename the actual file without losing saved progress. On Windows, use an intermediate name if changing only capitalization.

Positions save periodically and when practical on pause, exit, or page closure. A failed save can be retried, and concurrent edits require choosing between your current position and the database version. Wait for saves to finish before leaving. Abrupt browser or device closure can lose an unacknowledged save, including one still being sent.

DRM-protected, incomplete, or damaged files may not open, and browser codec support varies. AAXC files are not playable. Only use books from sources you trust.

### Book references

**Details** shows embedded EPUB information and covers or PDF metadata and first-page previews. Embedded M4B descriptions and covers are not currently read. To add a reference, paste a specific Wikipedia article URL and choose **Import**. Optionally select a Wikipedia or Wikimedia image URL; otherwise, the article's Commons image is used when available. The selected cover also appears on the shelf.

Only the selected article and image are requested from Wikipedia and Wikimedia, not your library list or book files. Imported text, attribution, and newly imported covers are saved in PostgreSQL for offline display while the server and database are running. Existing sidecar text is moved into the database when accessed; reimport older references to cache covers and add sections. Check the image's source and license before reusing it.

### Back up your books

Install [7-Zip](https://www.7-zip.org/) (or `7zz` on Linux/macOS), then run:

```powershell
npm run backup:books
npm run backup:audible
```

Each command creates and verifies a dated, maximum-compression `.7z` snapshot in `ebook-backups/`, retaining previous snapshots. The first backs up the whole `ebooks/` folder; the second backs up all of `audiblebooks/`, including non-M4B files. Wait for downloads to finish and don't change files during a backup. Already compressed books and audio may save little space and can take time.

Archives do **not** contain database progress, bookmarks, imported references, cached covers, or old browser-local positions. Back up PostgreSQL and browser data separately. Archives are **not encrypted** or off-device backups until copied elsewhere; they may contain private files and do not establish rights to the books. To restore, copy an archive to the target device and extract it in the project folder with a 7z-compatible extractor.

The library folders are excluded from Git and Docker build contexts, served only to the signed-in account, and not automatically deployed. For Docker, mount them at `/app/ebooks` and `/app/audiblebooks`; for remote deployments, the files must exist on that server.

## Development and deployment

The [setup guide](setup.md) covers configuration and OAuth. Normally `npm run dev` starts the API on port 3000 and the Vite client on port 5173. Restart it after changing server files. To run only the API, use `npx tsx server/index.ts`.

After changing the schema, run `npx prisma generate`; use `npx prisma migrate dev --name describe_your_change` to create a migration on a development database and review reset prompts carefully. Apply committed migrations with `npm run db:migrate`. Back up existing databases before applying migrations.

The book database integration tests use `TEST_DATABASE_URL` and create and delete test records. Point it only at a disposable database with the committed migrations already applied, then run `npm run test:book-data`.

For production, use HTTPS and your host's secret settings, apply migrations as a release step, and start the built server. The [Dockerfile](../Dockerfile) starts the server but does not apply migrations.
