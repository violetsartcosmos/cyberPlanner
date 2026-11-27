# API reference

The API is served by the same origin as the app. Book and calendar endpoints require a session for the configured Google account. Session, calendar, and book responses are marked non-cacheable. Requests that change data must pass the server's same-origin CSRF check.

Authenticated resource endpoints return `401` if the configured Google account
is not signed in.

JSON request bodies should use the types shown below. Invalid values rejected by the database can return `500`.

The optional `library` parameter accepts `ebooks` (the default) or `audiblebooks`.
Book requests that take a `path` require a non-empty path of at most 2,048 characters. Calendar requests require a valid `start` and `end` range.

## Session and calendar summaries

| Method and path | Description |
| --- | --- |
| `GET /api/session?date=...` | Loads sign-in/configuration state or authenticated app-shell data, including the selected date, balance, XP, and newly earned achievements. An invalid or omitted date defaults to today. |
| `GET /api/planner/calendar?date=...` | Loads routine history, selected-date synced tasks, points, and achievement progress for the dashboard or calendar. |

`GET /api/session` owns only shared shell state. Therapy, journal, quest,
reward, profile, and calendar pages load their own resource data through
purpose-specific endpoints. The dashboard and calendar share one selected-date
summary through `GET /api/planner/calendar`; journal markers use the separate
`GET /api/journals/markers` resource.

The former `GET /api/planner` aggregate and `POST /api/planner` intent
dispatcher have been removed. UI writes use feature-owned React Router actions
and resource endpoints; action results carry numeric HTTP statuses and API
errors rather than a planner-specific `ok` flag. The calendar summary route
remains because it is an active, purpose-built dashboard/calendar read.

Dates and completion states are checked at their request boundaries; task
assignments and one-time awards are checked in their services. Routine kinds
are checked against the server's point-value mapping. Stored-field constraints
are left to Prisma and the database.

The physical-therapy page reads exercise definitions, point values, completion
states, and earned points from `GET /api/therapy/sessions?date=...`. Writes use
the dated completion resource URL below. The server validates the session
assignment and determines the point value; an award occurs at most once for
that date, session, and exercise. Unchecking does not reverse an award.

## Journals

These endpoints require a signed-in session. Dates must be real calendar dates
in `YYYY-MM-DD` format.

| Method and path | Description |
| --- | --- |
| `GET /api/journals` | Lists saved entries as `[{"date":"YYYY-MM-DD","content":"..."}]`, newest first, including empty entries. |
| `GET /api/journals/markers` | Lists dates with non-empty content, newest first, for calendar markers. Whitespace-only content is included. |
| `POST /api/journals` | Creates an entry using `{"date":"YYYY-MM-DD","content":"..."}` and returns the saved date and content with `201`; an existing date returns `409`. Omitted content starts as an empty string. |
| `GET /api/journals/{date}` | Returns `{"date":"YYYY-MM-DD","content":"..."}`; returns `404` if no journal has been saved for that date. |
| `PUT /api/journals/{date}` | Creates or replaces the entry using `{"content":"..."}` and returns the saved date and content. Content can be empty. |
| `DELETE /api/journals/{date}` | Deletes the entry and returns `204` with no body; returns `404` if missing. |

These endpoints replace the journal reads formerly returned by `/api/planner`.
Deleting a journal does not alter points. Calendar marker reads list only
non-empty entries, while the journal browser lists every saved entry.
Invalid dates and malformed JSON return `400`; invalid content returns `422`.
Journal and authentication errors use `{"error":"..."}`, including malformed
JSON, blocked requests, and unexpected server errors. Unexpected errors are
logged and return `500`. The experimental Python API
uses `{"detail":"..."}` for journal errors and returns `422` with a `detail`
array for invalid request bodies, including malformed JSON.

The UI submits POST to `/journal/entries`, and PUT or DELETE to
`/journal/entries/{date}`. The journal page loader reads the collection and
selects the current entry from it. Dashboard and calendar routes separately
read the non-empty marker dates. A missing entry shows an explicit creation form; the editor
opens only after creation and always saves using the existing entry's date ID.
Deletion has its own fetcher and confirmed DELETE form, separate from autosave.
Autosave keeps the submitted content separate from edits made while saving.
Failed content is not automatically retried; subsequent edits submit new
content. There are no journal retry controls or session-storage draft recovery.
Unsaved changes still block navigation until saved or explicitly discarded.

For the readable React/Node CRUD walkthrough and remaining work, see the
[planner refactor plan](planner-refactor-plan.md).

## Quests

These endpoints require a signed-in session. Quest objects contain the stored fields, including `id`, `completedAt`, and `templateId`.

| Method and path | Description |
| --- | --- |
| `GET /api/quests` | Lists non-deleted quests, newest first. |
| `GET /api/quests/{id}` | Returns a non-deleted quest, or `404`. |
| `POST /api/quests` | Creates a quest and returns it with status `201`. |
| `PATCH /api/quests/{id}` | Updates the supplied quest fields and returns the quest. |
| `DELETE /api/quests/{id}` | Soft-deletes the quest and returns `204`; earned points are retained. |
| `POST /api/quests/{id}/complete` | Completes the quest and awards its points once; a repeated completion returns `409`. |
| `POST /api/quest-templates/{id}/accept` | Accepts a template once; repeated acceptance returns `409`. |

Creation accepts `{"title":"...", "description":"...", "kind":"side", "tier":"Common", "points":10}`. A patch accepts any non-empty subset of those fields. `kind` is `side`, `main`, or `boss`; `tier` is `Common`, `Rare`, `Epic`, or `Legendary`; points must be a positive whole number. The planner form limits points to 100,000. These routes use the same quest operations as planner actions.

Quest, achievement, and template routes are mounted from the gamification
resource; points and rewards are mounted from the points resource.

## Routines and therapy

These endpoints require a signed-in session. Dates use `YYYY-MM-DD`.

| Method and path | Description |
| --- | --- |
| `GET /api/routines` | Returns routine definitions and weekday groups. |
| `GET /api/routines/completions?date=...` | Returns the date and checked task IDs for that day. |
| `PATCH /api/routines/{id}` | Changes a routine's kind with `{"kind":"main"}`; its point value is set by the server. |
| `PUT /api/routines/{id}/completions/{date}` | Sets a task's check state with `{"completed":true}`. Returns the day's checks and newly earned achievements. |
| `GET /api/therapy/sessions?date=...` | Returns the therapy plan and completion states for that day. |
| `PUT /api/therapy/sessions/{sessionId}/exercises/{exerciseId}/completions/{date}` | Sets an exercise's check state with `{"completed":true}` and returns newly earned achievements. |

Routine and therapy completions award points at most once per date and task. Unchecking does not reverse the award. The server validates the task's weekday or therapy assignment and refreshes achievements as in the planner.

Extra request fields are ignored; point values and achievement progress are determined by the server.

## Achievements, synced tasks, and points

These endpoints require a signed-in session. Dates use `YYYY-MM-DD`.

| Method and path | Description |
| --- | --- |
| `GET /api/profile` | Returns routine definitions and completion history, routine groups, achievement progress, lifetime XP, and milestones earned during the read. |
| `GET /api/achievements` | Lists non-deleted stored achievements. It does not recalculate progress. |
| `POST /api/achievements` | Creates an achievement, refreshes progress, and returns the achievement and newly earned achievements. |
| `GET /api/quest-templates` | Lists quest templates by track and position. |
| `GET /api/quest-templates/accepted` | Lists template IDs already accepted by the signed-in user. |
| `GET /api/external-tasks?date=...` | Lists active Google and Gmail tasks due on that date or without a due date. |
| `PUT /api/external-tasks/{source}/{id}/completion` | Sets completion using `{"date":"YYYY-MM-DD","completed":true}`. Google tasks are also updated in Google. |
| `GET /api/points?date=...` | Returns balance, points earned on the date, earned task keys, and recent redemptions. |
| `GET /api/rewards` | Lists rewards and their server-defined costs. |
| `POST /api/rewards/{id}/redemptions` | Redeems a reward; returns `409` if the balance is insufficient. |

To create an achievement, send `title`, `description`, `category`, `tier`, integer `xp` and `target`, and `tracking` (`points` or `streak`). A streak also requires a routine `taskId`; `reward` is optional. Existing achievements cannot be edited. Creation returns `201` with `achievement` and `earnedAchievements`; the UI retains immediate milestone notifications. Point awards and redemptions remain ledger operations rather than arbitrary ledger edits.

## Google Tasks and Gmail

These endpoints require the configured signed-in session and use the same
Google service operations as the legacy planner adapters.

| Method and path | Description |
| --- | --- |
| `POST /api/google/tasks/sync/{date}` | Synchronizes Google tasks and returns the checked-record `count` and notification `message`. Invalid dates return `400`. |
| `GET /api/google/gmail/messages?query=...` | Searches Gmail and returns `{"emails":[...]}` with message IDs, subjects, senders and snippets. Queries must be non-empty after trimming. |
| `POST /api/google/gmail/messages/{id}/tasks/{date}` | Imports one email as a task; returns a notification `message` with `201` when created or `200` when already imported. Invalid IDs/dates return `400`. |

Google remote-update orchestration and local persistence are unchanged.
These operations retain no-store headers, sign-in checks and same-origin CSRF
protection for writes.

## Books

| Method and path | Description |
| --- | --- |
| `GET /api/books` | Lists books from both configured libraries. |
| `GET /api/books/file?path=...&library=...` | Streams a book. Supports the HTTP `Range` header for partial reads. |
| `GET /api/books/details?path=...&library=...` | Loads saved Wikipedia details for a book. |
| `POST /api/books/details` | Saves book details from a JSON body containing `path`, `details`, and optional `library` and `cover`. A cover has base64 `data` and an image MIME `type`; only supported image formats and valid image signatures are accepted. |
| `GET /api/books/cover?path=...&library=...` | Loads the book's saved cover image. |
| `GET /api/books/bookmarks?path=...&library=...` | Lists bookmarks for a book. |
| `POST /api/books/bookmarks` | Adds a bookmark using `path`, `position`, `label`, and optional `library`. |
| `DELETE /api/books/bookmarks?path=...&id=...&library=...` | Removes a bookmark. |
| `GET /api/books/progress?path=...&library=...` | Loads a book's saved reading position and revision. |
| `PUT /api/books/progress` | Saves a reading position using `path`, `position`, `revision`, and optional `library`. A stale revision returns `409` with the current progress. |
| `GET /api/books/chapters?path=...&library=...` | Loads the chapter list for a book. |
| `POST /api/books/rename` | Renames a book using `path`, `title`, and optional `library`, preserving its saved planner data. |

The `details` value is a Wikipedia details object described in the [models guide](models.md). Book progress positions are format-specific: EPUB uses a CFI, audiobooks use a non-negative time, and PDFs do not support saved progress.

Book API paths and methods are unchanged. The UI uses book-owned routes with
library, encoded file path and bookmark IDs in URL parameters. Metadata imports
still verify Wikipedia text and image licensing before submitting the saved
article and offline cover. Renaming remains a file operation, not a new CRUD
endpoint. Reader progress retains serialized PUT writes, page-exit keepalive,
retry after uncertain writes, and explicit keep-mine/use-database recovery for
`409` conflicts. Progress results now expose the numeric HTTP status.

## Calendar

| Method and path | Description |
| --- | --- |
| `GET /api/calendar?start=...&end=...` | Loads Google Calendar events for a valid date range. |
| `POST /api/calendar/{calendarId}/events` | Creates an event and returns a notification `message` with `201`. |
| `PATCH /api/calendar/{calendarId}/events/{id}` | Updates one event occurrence and returns a notification `message`; a changed Google etag returns `409`. |

Event writes accept `title`, `start`, `end`, boolean `allDay`, `etag`,
`startTimeZone` and `endTimeZone`. Creation uses an empty etag; updates require
the current etag. All-day dates use `YYYY-MM-DD` with an exclusive end date.
The UI submits timed starts/ends as canonical UTC timestamps and preserves
unchanged instants and existing time zones when editing. The end must follow
the start, and updates require the current etag; these rules return `400` when
violated. Field formats and limits are left to Google rather than duplicated
in the client or server. Updates retain Google `If-Match` checks and only
patch the edited fields, preserving unrelated event metadata.

## Sign-in

| Method and path | Description |
| --- | --- |
| `GET /auth/google` | Starts Google sign-in. |
| `GET /auth/callback` | Completes sign-in and returns to the app. |
| `POST /auth/logout` | Ends the current session. |

Unknown `/api/*` and `/auth/*` routes return `404`.
